require("dotenv").config();
const axios = require("axios");
const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const connectDB = require("./db");
const app = express();
app.use(express.json());
connectDB();

const BASE_URI = process.env.BASE_URI;
const SOURCE_ACCESS_TOKEN = process.env.SOURCE_ACCESS_TOKEN;
const DESTINATION_ACCESS_TOKEN = process.env.DESTINATION_ACCESS_TOKEN;
const PORT = process.env.PORT;

const contactSchema = new mongoose.Schema({
  contactId: { type: Number, unique: true },
  firstName: String,
  lastName: String,
  email: String,
  phoneNumber: String,
  contactOwner: String,
});
const Contact = mongoose.model("Contact", contactSchema);

const companySchema = new mongoose.Schema({
  companyId: { type: Number, unique: true },
  companyName: String,
  addedToListOn: String,
  companyDomainName: String,
  companyOwner: String,
  createDate: String,
  phoneNumber: String,
  lastActivityDate: String,
  city: String,
  country: String,
  industry: String
});
const HubCompanyV2 = mongoose.model("HubCompaniesV2", companySchema);


app.get("/fetch-contacts", async (req, res) => {
  // Read contacts from CSV file and save them to DB
  fs.readFile("/home/astha-2757/Downloads/csvjson_company.json", "utf8", async (err, data) => {
    // fs.readFile("/home/astha-2757/Downloads/Syncing3contact", "utf8", async (err, data) => {
    if (err) throw err;
    // console.log("data",data);
    const contacts = JSON.parse(data).slice(0, 2164);
    console.log("contacts", contacts);
    for (const contact of contacts) {
      const newContact = new Contact({
        contactId: contact["Record ID - Contact"],
        email: contact["Email"],
        phoneNumber: contact["Phone Number"],
        contactOwner: contact["Company owner"],
      });
      await newContact.save().catch(err => console.log(`Error saving contact ${contact["Email"]}: ${err.message}`));
    }
    console.log("Contacts saved successfully!");

  });
})

// Function to fetch all HubSpot owners and create a map
async function fetchOwnersMap(DESTINATION_ACCESS_TOKEN) {
  try {

    const response = await axios.get(`https://api.hubapi.com/crm/v3/owners`, {
      headers: {
        Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const owners = response.data.results;
    // console.log("owners",owners);
    // Create a map of owner full name to ownerId
    const ownersMap = owners.reduce((map, owner) => {
      const fullName = `${owner.firstName} ${owner.lastName}`.toLowerCase();
      // console.log("fullName",fullName);
      map[fullName] = owner.id;
      return map;
    }, {});

    // console.log("ownersMap",ownersMap);


    return ownersMap;
  } catch (error) {
    console.log(`Error fetching owners: ${error.message}`);
    return {};
  }
}

app.get("/contacts", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 2167;

    // Fetch contacts from the database with pagination
    const contactsFromDB = await Contact.find()
      .skip((page - 1) * limit)
      .limit(limit);

    // Fetch all HubSpot owners once and create a map
    const ownersMap = await fetchOwnersMap(DESTINATION_ACCESS_TOKEN);
    // console.log("ownersMappppppppppp",ownersMap);
    const processedContacts = [];

    for (const contact of contactsFromDB) {
      const email = contact.email;
      const contactId = contact.contactId;
      console.log("contactId", contactId);
      try {
        // Get ownerId from the ownersMap
        // const ownerId = ownersMap[contact.contactOwner] || null;
        // // console.log("ownerId",ownerId);
        // // Build the contact data
        // const contactData = {
        //   properties: {
        //     firstname: contact.firstName,
        //     lastname: contact.lastName,
        //     email: contact.email,
        //     ...(ownerId && { hubspot_owner_id: ownerId }),
        //   },
        // };
        // // console.log("contactData",contactData);
        // // Search for existing contact by email
        // const contactResponse = await axios.post(
        //   `${BASE_URI}/crm/v3/objects/contacts/search`,
        //   {
        //     filterGroups: [
        //       {
        //         filters: [
        //           { propertyName: "email", operator: "EQ", value: email },
        //         ],
        //       },
        //     ],
        //   },
        //   {
        //     headers: {
        //       Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //       "Content-Type": "application/json",
        //     },
        //   }
        // );

        // const results = contactResponse.data.results;
        // const existingContactId = results && results.length > 0 ? results[0].id : null;
        // let recordId=null;
        // // Update or create contact
        // if (existingContactId) {
        //   await axios.patch(
        //     `${BASE_URI}/crm/v3/objects/contacts/${existingContactId}`,
        //     contactData,
        //     {
        //       headers: {
        //         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //         "Content-Type": "application/json",
        //       },
        //     }
        //   );
        //   recordId=existingContactId;
        //   console.log(`Contact ${contact.email} updated successfully.`);
        // }else {
        //   const response=await axios.post(
        //     `${BASE_URI}/crm/v3/objects/contacts`,
        //     contactData,
        //     {
        //       headers: {
        //         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //         "Content-Type": "application/json",
        //       },
        //     }
        //   );
        //   recordId = response.data.id;
        //   console.log(`Contact ${contact.email} created successfully.`);
        // }

        // Add contact to the processedContacts array
        processedContacts.push({
          // newid: recordId,
          originalid: contactId,
          properties: { email: contact.email },
        });
        // console.log("processedContacts",processedContacts);

      } catch (error) {
        console.log(`Error processing contact ${contact.email}: ${error.message}`);
      }
    }

    // Pass the processed contacts to processNotesForContacts
    // await processNotesForContacts(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processTaskForContacts(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processMeetingForContacts(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processCallForContacts(processedContacts, SOURCE_ACCESS_TOKEN);
    await fetchEmailsForContacts(processedContacts, SOURCE_ACCESS_TOKEN, DESTINATION_ACCESS_TOKEN);

    res.status(200).json({ message: "Contacts processed successfully!" });
  } catch (error) {
    console.log("Error fetching contacts:", error.message);
    res.status(500).json({ message: "Error fetching contacts" });
  }
});

async function processNotesForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    const email = data.properties.email;
    console.log("email-------->", email);
    const notes = await fetchNotesFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // Sync only the current note with HubSpot or perform further processing
    await syncNotesWithHubSpot(email, notes);
  }
}
//Function to fetch all notes from salesforce
async function fetchNotesFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching notes for contact ID:", dataId);
  // console.log("SOURCE_ACCESS_TOKEN",SOURCE_ACCESS_TOKEN);
  try {
    // Step 1: Fetch note associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/contact/${dataId}/associations/notes`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedNotes = associationResponse.data.results;
    if (!associatedNotes || associatedNotes.length === 0) {
      console.log("No notes associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed note properties
    const notes = await Promise.all(
      associatedNotes.map(async (noteAssociation) => {
        const noteId = noteAssociation.toObjectId;
        const noteDetailsUrl = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_timestamp,hs_note_body,hs_note_subject`;

        try {
          const noteDetailsResponse = await axios.get(noteDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const noteData = noteDetailsResponse.data;
          return {
            id: noteId,
            timestamp: noteData.properties.hs_timestamp || null, // Note timestamp
            body: noteData.properties.hs_note_body || "No body content", // Note body
            subject: noteData.properties.hs_note_subject || "No subject", // Note subject
          };
        } catch (error) {
          console.error(`Error fetching details for note ID ${noteId}:`, error.message);
          return null; // Skip this note if there's an error
        }
      })
    );

    const filteredNotes = notes.filter((note) => note !== null); // Remove any null values
    console.log(`Fetched ${filteredNotes.length} notes for contact ${dataId}`);
    // console.log("Note Details:", filteredNotes);

    return filteredNotes;
  } catch (error) {
    console.error(
      `Error fetching notes for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
async function syncNotesWithHubSpot(email, notes) {
  console.log("email", email);
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }
  console.log("hubSpotContactId", hubSpotContactId);

  for (const note of notes) {
    console.log("Processing note:", note);

    try {
      // Convert `timestamp` to milliseconds
      const timestamp = note.timestamp
        ? new Date(note.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "NOTE",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            body: note.body || "No body content", // Note content
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Note for Contact ${hubSpotContactId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing note for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
async function getHubSpotContactIdByEmail(email, accessToken) {
  const url = `https://api.hubapi.com/crm/v3/objects/contacts/search`;
  try {
    const response = await axios.post(
      url,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.results[0]?.id || null;
  } catch (error) {
    console.error(
      "Error retrieving HubSpot contact ID:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
}
// Function to process tasks for contacts
async function processTaskForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    // console.log("dataId----------------------------------", data.id);
    const email = data.properties.email;
    console.log("email-------->", email);


    const tasks = await fetchTasksFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // console.log(`Tasks for Contact ${data.id}:`, tasks);

    // Sync only the current task with HubSpot or perform further processing
    await syncTasksWithHubSpot(email, tasks);
  }
}
async function fetchTasksFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching tasks for contact ID:", dataId);

  try {
    // Step 1: Fetch task associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/contact/${dataId}/associations/tasks`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedTasks = associationResponse.data.results;
    if (!associatedTasks || associatedTasks.length === 0) {
      console.log("No tasks associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed task properties
    const tasks = await Promise.all(
      associatedTasks.map(async (taskAssociation) => {
        const taskId = taskAssociation.toObjectId;
        const taskDetailsUrl = `https://api.hubapi.com/crm/v3/objects/tasks/${taskId}?properties=hs_timestamp,hs_task_status,hs_task_priority,hs_task_body,hs_task_subject,hs_task_type`;

        try {
          const taskDetailsResponse = await axios.get(taskDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const taskData = taskDetailsResponse.data;
          return {
            id: taskId,
            timestamp: taskData.properties.hs_timestamp || null, // Task timestamp
            status: taskData.properties.hs_task_status || "UNKNOWN", // Task status
            priority: taskData.properties.hs_task_priority || "NONE", // Task priority
            body: taskData.properties.hs_task_body || "No body content", // Task body
            subject: taskData.properties.hs_task_subject || "No subject", // Task subject
            type: taskData.properties.hs_task_type || "TODO", // Task type
          };
        } catch (error) {
          console.error(`Error fetching details for task ID ${taskId}:`, error.message);
          return null; // Skip this task if there's an error
        }
      })
    );

    const filteredTasks = tasks.filter((task) => task !== null); // Remove any null values
    console.log(`Fetched ${filteredTasks.length} tasks for contact ${dataId}`);
    console.log("Task Details:", filteredTasks);

    return filteredTasks;
  } catch (error) {
    console.error(
      `Error fetching tasks for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync tasks with HubSpot
async function syncTasksWithHubSpot(email, tasks) {
  console.log("DESTINATION_ACCESS_TOKEN", DESTINATION_ACCESS_TOKEN);
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  console.log("----------hubSpotContactId---------->", hubSpotContactId);

  for (const task of tasks) {
    // console.log("Processing task:", task);

    try {
      const isCompleted = task.status === "COMPLETED";

      // Convert `timestamp` to milliseconds
      const timestamp = task.timestamp
        ? new Date(task.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const completionDate = isCompleted
        ? task.lastUpdated
          ? new Date(task.lastUpdated).getTime()
          : new Date(task.createdAt).getTime()
        : null; // Convert `completionDate` to milliseconds

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: !isCompleted, // Active tasks are considered "open"
            type: "TASK",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            subject: task.subject || "No subject",
            body: task.body || "No body content",
            status: task.status || "NOT_STARTED", // Ensure status is valid
            taskType: task.taskType || "TODO",
            completionDate, // Send completionDate in milliseconds if applicable
            priority: task.priority || "NONE",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Task for Contact ${hubSpotContactId} synced successfully--------------->:`
      );
    } catch (error) {
      console.error(
        `Error syncing task for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
// Function to process meetings for contacts
async function processMeetingForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    // console.log("dataId----------------------------------", data.id);
    const email = data.properties.email;
    console.log("email-------->", email);

    const meetings = await fetchMeetingsFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // Sync only the current meeting with HubSpot or perform further processing
    await syncMeetingsWithHubSpot(email, meetings);
  }
}
// Function to fetch meetings from HubSpot
async function fetchMeetingsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching meetings for contact ID:", dataId);

  try {
    // Step 1: Fetch meeting associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/contact/${dataId}/associations/meetings`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedMeetings = associationResponse.data.results;
    if (!associatedMeetings || associatedMeetings.length === 0) {
      console.log("No meetings associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed meeting properties
    const meetings = await Promise.all(
      associatedMeetings.map(async (meetingAssociation) => {
        const meetingId = meetingAssociation.toObjectId;
        const meetingDetailsUrl = `https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_body,hs_meeting_title,hs_meeting_start_time,hs_meeting_end_time`;

        try {
          const meetingDetailsResponse = await axios.get(meetingDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const meetingData = meetingDetailsResponse.data;
          return {
            id: meetingId,
            body: meetingData.properties.hs_meeting_body || "No body content", // Meeting body
            title: meetingData.properties.hs_meeting_title || "No title", // Meeting title
            startTime: meetingData.properties.hs_meeting_start_time || null, // Start time
            endTime: meetingData.properties.hs_meeting_end_time || null, // End time
          };
        } catch (error) {
          console.error(`Error fetching details for meeting ID ${meetingId}:`, error.message);
          return null; // Skip this meeting if there's an error
        }
      })
    );

    const filteredMeetings = meetings.filter((meeting) => meeting !== null); // Remove any null values
    console.log(`Fetched ${filteredMeetings.length} meetings for contact ${dataId}`);
    console.log("Meeting Details:", filteredMeetings);

    return filteredMeetings;
  } catch (error) {
    console.error(
      `Error fetching meetings for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync meetings with HubSpot
async function syncMeetingsWithHubSpot(email, meetings) {
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  console.log("hubSpotContactId", hubSpotContactId);

  for (const meeting of meetings) {
    console.log("Processing meeting:", meeting);

    try {
      // Convert times to milliseconds
      const startTime = meeting.startTime
        ? new Date(meeting.startTime).getTime()
        : new Date().getTime(); // Use current time if no start time

      const endTime = meeting.endTime
        ? new Date(meeting.endTime).getTime()
        : startTime + 3600000; // Default to 1 hour duration if no end time

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: false, // Meetings are usually non-active after they occur
            type: "MEETING",
            timestamp: startTime, // Start time in milliseconds
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            body: meeting.body || "No body content",
            title: meeting.title || "No title",
            startTime, // Meeting start time in milliseconds
            endTime, // Meeting end time in milliseconds
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Meeting for Contact ${hubSpotContactId} synced successfully:`
      );
    } catch (error) {
      console.error(
        `Error syncing meeting for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
// Function to process call activities for contacts
async function processCallForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    const email = data.properties.email;
    console.log("email-------->", email);
    const calls = await fetchCallsFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // console.log(`Calls for Contact ${data.id}:`, calls);
    // Sync only the current call with HubSpot or perform further processing
    await syncCallsWithHubSpot(email, calls);
  }
}
async function fetchCallsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching calls for contact ID:", dataId);

  try {
    // Step 1: Fetch call associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/contact/${dataId}/associations/calls`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // console.log("Association Response:", associationResponse.data);

    const associatedCalls = associationResponse.data.results;
    if (!associatedCalls || associatedCalls.length === 0) {
      console.log("No calls associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed call properties
    const calls = await Promise.all(
      associatedCalls.map(async (callAssociation) => {
        const callId = callAssociation.toObjectId;
        const callDetailsUrl = `https://api.hubapi.com/engagements/v1/engagements/${callId}?properties=hs_timestamp,hs_call_status,hs_call_body,hs_call_subject,hs_call_recording_url`;

        try {
          const callDetailsResponse = await axios.get(callDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const callData = callDetailsResponse.data;
          // console.log("callData",callData);
          return {
            timestamp: callData.engagement.createdAt || null,
            status: callData.metadata.status || "UNKNOWN", // Call status
            body: callData.metadata.body || "No notes available", // Call notes
            subject: callData.metadata.title || "No subject", // Call subject

          };
        } catch (error) {
          console.error(`Error fetching details for call ID ${callId}:`, error.message);
          return null; // Skip this call if there's an error
        }
      })
    );

    const filteredCalls = calls.filter((call) => call !== null); // Remove any null values
    console.log(`Fetched ${filteredCalls.length} calls for contact ${dataId}`);
    console.log("Call Details:", filteredCalls);

    return filteredCalls;
  } catch (error) {
    console.error(
      `Error fetching calls for HubSpot contact ${dataId}:`,
      // error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync call activities with HubSpot
async function syncCallsWithHubSpot(email, calls) {
  // console.log("email",email);
  // console.log("calls",calls);
  const hubSpotContactId = await getHubSpotContactIdByEmail(email, DESTINATION_ACCESS_TOKEN);
  console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }
  for (const call of calls) {
    // console.log("Processing call:", call);
    try {
      const timestamp = call.timestamp
        ? new Date(call.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true, // Assuming the call is active (can adjust based on your logic)
            type: "CALL",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            subject: call.subject || "No subject", // Call subject
            body: call.body || "No call notes available", // Call body
            status: call.status || "COMPLETED", // Ensure status is valid
            recordingUrl: call.recordingUrl || null, // Attach the call recording URL if available
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Call activity for Contact ${hubSpotContactId} synced successfully:`

      );
    } catch (error) {
      console.error(
        `Error syncing call activity for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
async function fetchEmailsForContacts(
  data1,
  sourceAccessToken,
  targetAccessToken
) {
  const results = [];

  for (const data of data1) {
    console.log("data", data);
    try {
      // Fetch engagements (tasks, emails, etc.) for each contact
      const url = `https://api.hubapi.com/engagements/v1/engagements/associated/CONTACT/${data.originalid}/paged?limit=100`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${sourceAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      // Filter for EMAIL engagements (email activities)
      const emails = response.data.results.filter(
        (engagement) => engagement.engagement.type === "EMAIL"
      );

      for (const email of emails) {
        // console.log("Email Engagement: ", email);

        const { id: engagementId, subject, status, body: emailBody, timestamp } = email.engagement;
        // console.log(`Email ID: ${engagementId}`);
        // console.log(`Subject: ${subject}`);
        // console.log(`Status: ${status}`);
        // console.log(`Body: ${emailBody}`);
        // console.log(`Timestamp: ${timestamp}`);

        // Get the contact ID from associations
        const contactId = email.associations.contactIds[0];

        // Fetch the contact's email using the contact ID
        if (!contactId) {
          console.error("No associated contact ID found for this engagement.");
          continue;
        }

        const contactUrl = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`;
        const contactResponse = await axios.get(contactUrl, {
          headers: {
            Authorization: `Bearer ${sourceAccessToken}`,
            "Content-Type": "application/json",
          },
        });

        const contactEmail = contactResponse.data.properties.email;
        if (!contactEmail) {
          console.error(`No email address found for contact ${contactId}`);
          continue;
        }

        console.log("Contact email:-------------->", contactEmail);

        // Search for the contact in the target HubSpot by email
        let getResponse;
        try {
          getResponse = await searchContactByEmail(
            "https://api.hubapi.com/crm/v3/objects/contacts/search",
            contactEmail,
            targetAccessToken
          );
        } catch (error) {
          console.error("Error searching for contact by email:", error.message);
          continue;
        }

        if (getResponse.results.length === 0) {
          console.error(`HubSpot Contact Not Found for email: ${contactEmail}`);
          continue;
        }

        const hubSpotContactId = getResponse.results[0].id;
        console.log(`HubSpot Contact ID for ${contactEmail}:`, hubSpotContactId);

        // Handle email attachments if present
        if (email.attachments && email.attachments.length > 0) {
          for (const attachment of email.attachments) {
            try {
              // Step 1: Download the attachment from the source HubSpot
              const fileData = await downloadAttachment(
                attachment.id,
                sourceAccessToken
              );
              console.log(`Downloaded file ${attachment.id}`);

              // Step 2: Upload the attachment to the target HubSpot
              const uploadFileId = await uploadFileToHubSpot(fileData);
              console.log(`Uploaded file with ID ${uploadFileId}`);

              // Step 3: Create engagement with attachment in the target HubSpot
              await createEngagementWithAttachment(
                email,
                hubSpotContactId,
                uploadFileId,
                targetAccessToken
              );
            } catch (error) {
              console.error(
                `Error syncing attachment ${attachment.id}:`,
                error.message
              );
            }
          }
        } else {
          // Sync email without attachments
          try {
            await createEngagementWithAttachment(
              email,
              hubSpotContactId,
              null, // No attachment
              targetAccessToken
            );
          } catch (error) {
            console.error(`Error syncing email without attachments:`, error.message);
          }
        }
      }

      console.log(`Fetched ${emails.length} emails for contact ${data.id}`);
    } catch (error) {
      console.error(
        `Error fetching emails for contact ${data.id}:`,
        error.response ? error.response.data : error.message
      );
    }
  }

  return results;
}
const downloadAttachment = async (attachmentId, accessToken) => {
  try {
    const url = `https://api.hubapi.com/files/v3/files/${attachmentId}`;
    // Get file details
    const fileDetailsResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("File details:", fileDetailsResponse.data);

    const extension = fileDetailsResponse.data.extension || "unknown";
    if (!extension) {
      console.error(
        `Missing file extension for ${fileDetailsResponse.data.name}`
      );
      return null;
    }

    // Step 2: Generate signed download URL
    const signedUrlResponse = await axios.get(`${url}/signed-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const downloadUrl = signedUrlResponse.data.url; // Check if this is correct
    // console.log("downloadUrl+++++++++++++++++++++++", downloadUrl);
    const fileData = await axios.get(downloadUrl, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      responseType: "arraybuffer",
    });

    // console.log("fileData++++++++++++++++++", fileData.data);
    // const filePath = path.join(__dirname, 'downloads',`${fileDetailsResponse.data.name}.${extension}`);
    const filePath = path.join(
      __dirname,
      "downloads",
      `${fileDetailsResponse.data.name}.` +
      `${fileDetailsResponse.data.extension}`
    );
    // console.log("filePath-------------------->", filePath);
    fs.writeFileSync(filePath, fileData.data);
    console.log(`File saved successfully at: ${filePath}`);

    return filePath;
  } catch (error) {
    console.error(
      "Error downloading file:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
async function uploadFileToHubSpot(filePath) {
  console.log("filepath-------------->0,", filePath);
  try {
    const fileContent = fs.readFileSync(filePath);
    console.log("fileContent-----------------", fileContent);
    const fileName = path.basename(filePath);
    console.log("fileName------------------------", fileName);
    const hubspotUrl = `https://api.hubapi.com/files/v3/files`;

    const formData = new FormData();
    formData.append("file", fileContent, fileName);

    const folderPath = "/";
    formData.append("folderPath", folderPath);
    formData.append(
      "options",
      JSON.stringify({ access: "PRIVATE", folderPath })
    );

    const uploadResponse = await axios.post(hubspotUrl, formData, {
      headers: {
        Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
    });

    // fs.unlinkSync(filePath); // Ensure the file path variable is correct here
    // console.log("File uploaded to HubSpot:", hubspotResponse.data);
    console.log("uploadResponse", uploadResponse.data);
    return uploadResponse.data;
  } catch (error) {
    console.error(
      "Error uploading file to HubSpot:",
      error.response ? error.response.data : error.message
    );
  }
}
async function createEngagementWithAttachment(
  email,
  hubSpotContactId,
  uploadedFileId,
  accessToken
) {
  try {
    // console.log("uploadedFileId:", uploadedFileId);
    // console.log("email:", email);
    // console.log("hubSpotContactId:", hubSpotContactId);
    // console.log("accessToken:", accessToken);
    const emailBody = email.metadata.html || (email.metadata.text ? `<pre>${email.metadata.text}</pre>` : "No body content"); // Wrap plain text in <pre> for basic formatting
    const engagementData = {
      engagement: {
        active: true,
        type: "EMAIL",
        timestamp: email.engagement.createdAt, // Ensure this is a number
      },
      associations: {
        contactIds: [hubSpotContactId],
      },
      attachments: uploadedFileId
        ? [
          {
            id: typeof uploadedFileId === "object" ? uploadedFileId.id : uploadedFileId,
          },
        ]
        : [], // Only include attachments if uploadedFileId is provided
      metadata: {
        html: emailBody, // Use the formatted email body,
        // from: {
        //   email: email.FromAddress,
        // },
        subject: email.metadata.subject || "No subject content",
        // body: email.metadata.text || email.metadata.html || "No body content",
        // from: email.metadata.from || {}, // Sender's details
        to: email.metadata.to || [], // Recipients
        cc: email.metadata.cc || [], // CC recipients
        bcc: email.metadata.bcc || [], // BCC recipients
        sender: email.metadata.sender || {}, // Sender information
        text: email.metadata.text || "", // Plain text body
      },
    };

    // console.log(
    //   "Engagement data being sent:",
    //   JSON.stringify(engagementData, null, 2)
    // );

    const engagementResponse = await axios.post(
      "https://api.hubapi.com/engagements/v1/engagements",
      engagementData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `Email synced successfully with HubSpot for contact ID ${hubSpotContactId}.`
    );
  } catch (error) {
    console.error(
      `Error syncing email for contact ID ${hubSpotContactId}:`,
      error.response ? error.response.data : error.message
    );
  }
}
//Function to  search contact in hubspot
const searchContactByEmail = async (url, email, accessToken) => {
  try {
    const { data } = await axios.post(
      url,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return data;
  } catch (error) {
    console.log(
      "Error getting contact from HubSpot:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
//Function to  search contact in hubspot
const searchCompanyByDomain = async (url, domain, accessToken) => {
  console.log("domain", domain);
  try {
    const { data } = await axios.post(
      url,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "domain",
                operator: "EQ",
                value: domain,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return data;
  } catch (error) {
    console.log(
      "Error getting contact from HubSpot:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
//Function to  search contact in hubspot
const searchCompanyByCompanyName = async (url, companyName, accessToken) => {
  console.log("companyName", companyName);
  try {
    const { data } = await axios.post(
      url,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "name",
                operator: "EQ",
                value: companyName,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return data;
  } catch (error) {
    console.log(
      "Error getting contact from HubSpot:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};

app.get("/fetch-companies", async (req, res) => {
  console.log("Entry point");
  fs.readFile("/home/astha-2757/Downloads/csvjson1.json", "utf8", async (err, data) => {
    if (err) throw err;

    const companies = JSON.parse(data).slice(0, 1113);
    // console.log("Companies:", companies);

    for (const company of companies) {
      // console.log("company", company);
      const newCompanyV2 = new HubCompanyV2({
        companyId: company["Record ID"],
        companyName: company["Company name"],
        addedToListOn: company["Added To List On"],
        companyDomainName: company["Company Domain Name"],
        companyOwner: company["Company owner"],
        createDate: company["Create Date"],
        phoneNumber: company["Phone Number"],
        lastActivityDate: company["Last Activity Date"],
        city: company["City"],
        country: company["Country/Region"],
        industry: company["Industry"]
      }
      );

      await newCompanyV2.save().catch(err =>
        console.log(`Error saving company ${company["Company name"]}: ${err.message}`)
      );
    }
    console.log("Companies saved successfully in HubCompaniesV2 collection!");
    res.status(200).send("Data saved to HubCompaniesV2 collection!");
  });
});

app.get("/companies", async (req, res) => {
  console.log("enterrr");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1113;

    // Fetch companies from the database with pagination
    const companiesFromDB = await HubCompanyV2.find()
      .skip((page - 1) * limit)
      .limit(limit);

    const processedContacts = [];

    for (const company of companiesFromDB) {
      const companyDomainName = company.companyDomainName;
      const companyId = company.companyId;
      const companyName = company.companyName; // Assuming companyName is part of the company object
      console.log("companyDomainName", companyDomainName);
      console.log("companyId", companyId);

      try {
        // Prepare the search filter
        // let searchFilter;
        // if (companyDomainName) {
        //   searchFilter = {
        //     filterGroups: [
        //       {
        //         filters: [
        //           { propertyName: "domain", operator: "EQ", value: companyDomainName },
        //         ],
        //       },
        //     ],
        //   };
        // } else {
        //   searchFilter = {
        //     filterGroups: [
        //       {
        //         filters: [
        //           { propertyName: "name", operator: "EQ", value: companyName },
        //         ],
        //       },
        //     ],
        //   };
        // }

        // Search for the existing company
        // const contactResponse = await axios.post(
        //   `${BASE_URI}/crm/v3/objects/companies/search`,
        //   searchFilter,
        //   {
        //     headers: {
        //       Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //       "Content-Type": "application/json",
        //     },
        //   }
        // );

        // const results = contactResponse.data.results;
        // console.log("results", results);
        // const existingContactId = results && results.length > 0 ? results[0].id : null;

        // let recordId = null;
        // const companyData = {
        //   properties: {
        //     name: companyName,
        //     domain: companyDomainName,
        //     city: company.city,
        //   },
        // };

        // Update or create company
        // if (existingContactId) {
        //   await axios.patch(
        //     `${BASE_URI}/crm/v3/objects/companies/${existingContactId}`,
        //     companyData,
        //     {
        //       headers: {
        //         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //         "Content-Type": "application/json",
        //       },
        //     }
        //   );
        //   recordId = existingContactId;
        //   console.log(`Company ${companyName} updated successfully.`);
        // } 
        // else {
        // if(!existingContactId){
        //   const response = await axios.post(
        //     `${BASE_URI}/crm/v3/objects/companies`,
        //     companyData,
        //     {
        //       headers: {
        //         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        //         "Content-Type": "application/json",
        //       },
        //     }
        //   );
        //   recordId = response.data.id;
        //   console.log(`Company ${companyName} created successfully.`);
        // }

        // Add company to the processedContacts array
        processedContacts.push({
          originalid: companyId,
          properties: { domain: companyDomainName, name: companyName },
        });
        // console.log("processedContacts", processedContacts);
      } catch (error) {
        console.log(`Error processing company ${companyName}: ${error.message}`);
      }
    }
    // Pass the processed contacts to processNotesForContacts
    // await processNotesForCompanies(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processTaskForCompanies(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processMeetingForCompanies(processedContacts, SOURCE_ACCESS_TOKEN);
    // await processCallForCompanies(processedContacts, SOURCE_ACCESS_TOKEN);
    // await fetchEmailsForCompanies(processedContacts, SOURCE_ACCESS_TOKEN, DESTINATION_ACCESS_TOKEN);
    res.status(200).json({ message: "Companies processed successfully!" });
  } catch (error) {
    console.log("Error fetching companies:", error.message);
    res.status(500).json({ message: "Error fetching companies" });
  }
});


//<---------------------------------Notes for company------------------------------------------>
async function processNotesForCompanies(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const domain = data.properties.domain;
    const id = data.originalid;
    const companyName = data.properties.name;
    // console.log("name-------->", name);
    const notes = await fetchCompanyNotesFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // Sync only the current note with HubSpot or perform further processing
    await syncCompanyNotesWithHubSpot(domain, companyName, notes);
  }
}
//Function to fetch all notes from salesforce
async function fetchCompanyNotesFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching notes for contact ID:", dataId);

  try {
    // Step 1: Fetch note associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/companies/${dataId}/associations/notes`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedNotes = associationResponse.data.results;
    console.log("associatedNotes", associatedNotes);
    if (!associatedNotes || associatedNotes.length === 0) {
      console.log("No notes associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed note properties
    const notes = await Promise.all(
      associatedNotes.map(async (noteAssociation) => {
        const noteId = noteAssociation.toObjectId;
        const noteDetailsUrl = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_timestamp,hs_note_body,hs_note_subject`;

        try {
          const noteDetailsResponse = await axios.get(noteDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const noteData = noteDetailsResponse.data;
          console.log("noteData", noteData);
          return {
            id: noteId,
            timestamp: noteData.properties.hs_timestamp || null, // Note timestamp
            body: noteData.properties.hs_note_body || "No body content", // Note body
            subject: noteData.properties.hs_note_subject || "No subject", // Note subject
          };
        } catch (error) {
          console.error(`Error fetching details for note ID ${noteId}:`, error.message);
          return null; // Skip this note if there's an error
        }
      })
    );

    const filteredNotes = notes.filter((note) => note !== null); // Remove any null values
    console.log(`Fetched ${filteredNotes.length} notes for contact ${dataId}`);
    // console.log("Note Details:", filteredNotes);

    return filteredNotes;
  } catch (error) {
    console.error(
      `Error fetching notes for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
async function syncCompanyNotesWithHubSpot(domain, companyName, notes) {

  console.log("domain", domain);
  console.log("companyName", companyName);
  let hubSpotContactId
  if (domain) {
    hubSpotContactId = await searchCompanyByDomain(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      domain,
      DESTINATION_ACCESS_TOKEN
    );
  }
  else {
    console.log("enter when doain not present")
    hubSpotContactId = await searchCompanyByCompanyName(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      companyName,
      DESTINATION_ACCESS_TOKEN
    );
  }



  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for name: ${domain}`);
    return;
  }
  console.log("hubSpotContactId", hubSpotContactId);
  const hubId = hubSpotContactId.results[0].id;
  console.log("hb", hubId);
  for (const note of notes) {
    console.log("Processing note:", note);

    try {
      // Convert `timestamp` to milliseconds
      const timestamp = note.timestamp
        ? new Date(note.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp
      console.log("timestamp", timestamp);
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "NOTE",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            companyIds: [hubId],
          },
          metadata: {
            body: note.body || "No body content", // Note content
            subject: note.subject
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Note for Contact ${hubSpotContactId} synced successfully:`
      );
    } catch (error) {
      console.error(
        `Error syncing note for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
//<---------------------------------Tasks for company------------------------------------------>
// Function to process tasks for contacts
async function processTaskForCompanies(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const domain = data.properties.domain;
    const id = data.originalid;
    const companyName = data.properties.name;
    const tasks = await fetchCompanyTasksFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    console.log(`Tasks for Contact ${data.id}:`, tasks);
    // Sync only the current task with HubSpot or perform further processing
    await syncCompanyTasksWithHubSpot(domain, companyName, tasks);
  }
}
async function fetchCompanyTasksFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching tasks for contact ID:", dataId);

  try {
    // Step 1: Fetch task associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/companies/${dataId}/associations/tasks`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedTasks = associationResponse.data.results;
    console.log("associatedTasks", associatedTasks);
    if (!associatedTasks || associatedTasks.length === 0) {
      console.log("No tasks associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed task properties
    const tasks = await Promise.all(
      associatedTasks.map(async (taskAssociation) => {
        const taskId = taskAssociation.toObjectId;
        const taskDetailsUrl = `https://api.hubapi.com/crm/v3/objects/tasks/${taskId}?properties=hs_timestamp,hs_task_status,hs_task_priority,hs_task_body,hs_task_subject,hs_task_type`;

        try {
          const taskDetailsResponse = await axios.get(taskDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const taskData = taskDetailsResponse.data;
          console.log("taskData", taskData);
          return {
            id: taskId,
            timestamp: taskData.properties.hs_timestamp || null, // Task timestamp
            status: taskData.properties.hs_task_status || "UNKNOWN", // Task status
            priority: taskData.properties.hs_task_priority || "NONE", // Task priority
            body: taskData.properties.hs_task_body || "No body content", // Task body
            subject: taskData.properties.hs_task_subject || "No subject", // Task subject
            type: taskData.properties.hs_task_type || "TODO", // Task type
          };
        } catch (error) {
          console.error(`Error fetching details for task ID ${taskId}:`, error.message);
          return null; // Skip this task if there's an error
        }
      })
    );

    const filteredTasks = tasks.filter((task) => task !== null); // Remove any null values
    console.log(`Fetched ${filteredTasks.length} tasks for contact ${dataId}`);
    console.log("Task Details:", filteredTasks);

    return filteredTasks;
  } catch (error) {
    console.error(
      `Error fetching tasks for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync tasks with HubSpot
async function syncCompanyTasksWithHubSpot(domain, companyName, tasks) {
  console.log("domain", domain);
  console.log("companyName", companyName);
  let hubSpotContactId
  if (domain) {
    hubSpotContactId = await searchCompanyByDomain(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      domain,
      DESTINATION_ACCESS_TOKEN
    );
  }
  else {
    console.log("enter when doain not present")
    hubSpotContactId = await searchCompanyByCompanyName(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      companyName,
      DESTINATION_ACCESS_TOKEN
    );
  }
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for name: ${name}`);
    return;
  }

  console.log("hubSpotContactId", hubSpotContactId);
  const hubId = hubSpotContactId.results[0].id;
  console.log("hb", hubId);
  for (const task of tasks) {
    console.log("Processing task:", task);

    try {
      const isCompleted = task.status === "COMPLETED";

      // Convert `timestamp` to milliseconds
      const timestamp = task.timestamp
        ? new Date(task.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const completionDate = isCompleted
        ? task.lastUpdated
          ? new Date(task.lastUpdated).getTime()
          : new Date(task.createdAt).getTime()
        : null; // Convert `completionDate` to milliseconds

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: !isCompleted, // Active tasks are considered "open"
            type: "TASK",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            companyIds: [hubId],
          },
          metadata: {
            subject: task.subject || "No subject",
            body: task.body || "No body content",
            status: task.status || "NOT_STARTED", // Ensure status is valid
            taskType: task.taskType || "TODO",
            completionDate, // Send completionDate in milliseconds if applicable
            priority: task.priority || "NONE",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Task for Contact ${hubSpotContactId} synced successfully:`,
      );
    } catch (error) {
      console.error(
        `Error syncing task for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

//<----------------------------------Meeting for company-------------------------------------->
// Function to process meetings for contacts
async function processMeetingForCompanies(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const domain = data.properties.domain;
    const id = data.originalid;
    const companyName = data.properties.name;
    // console.log("dataId----------------------------------", data.id);
    // console.log("email-------->", email);

    const meetings = await fetchCompanyMeetingsFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // Sync only the current meeting with HubSpot or perform further processing
    await syncCompanyMeetingsWithHubSpot(domain, companyName, meetings);
  }
}
// Function to fetch meetings from HubSpot
async function fetchCompanyMeetingsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching meetings for contact ID:", dataId);

  try {
    // Step 1: Fetch meeting associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/companies/${dataId}/associations/meetings`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedMeetings = associationResponse.data.results;
    console.log("associatedMeetings", associatedMeetings);
    if (!associatedMeetings || associatedMeetings.length === 0) {
      console.log("No meetings associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed meeting properties
    const meetings = await Promise.all(
      associatedMeetings.map(async (meetingAssociation) => {
        const meetingId = meetingAssociation.toObjectId;
        const meetingDetailsUrl = `https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_body,hs_meeting_title,hs_meeting_start_time,hs_meeting_end_time`;

        try {
          const meetingDetailsResponse = await axios.get(meetingDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const meetingData = meetingDetailsResponse.data;
          console.log("meetingData", meetingData);
          return {
            id: meetingId,
            body: meetingData.properties.hs_meeting_body || "No body content", // Meeting body
            title: meetingData.properties.hs_meeting_title || "No title", // Meeting title
            startTime: meetingData.properties.hs_meeting_start_time || null, // Start time
            endTime: meetingData.properties.hs_meeting_end_time || null, // End time
          };
        } catch (error) {
          console.error(`Error fetching details for meeting ID ${meetingId}:`, error.message);
          return null; // Skip this meeting if there's an error
        }
      })
    );

    const filteredMeetings = meetings.filter((meeting) => meeting !== null); // Remove any null values
    console.log(`Fetched ${filteredMeetings.length} meetings for contact ${dataId}`);
    console.log("Meeting Details:", filteredMeetings);

    return filteredMeetings;
  } catch (error) {
    console.error(
      `Error fetching meetings for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync meetings with HubSpot
async function syncCompanyMeetingsWithHubSpot(domain, companyName, meetings) {
  console.log("domain", domain);
  console.log("companyName", companyName);
  let hubSpotContactId
  if (domain) {
    hubSpotContactId = await searchCompanyByDomain(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      domain,
      DESTINATION_ACCESS_TOKEN
    );
  }
  else {
    console.log("enter when doain not present")
    hubSpotContactId = await searchCompanyByCompanyName(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      companyName,
      DESTINATION_ACCESS_TOKEN
    );
  }
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for name: ${companyName}`);
    return;
  }

  console.log("hubSpotContactId", hubSpotContactId);
  const hubId = hubSpotContactId.results[0].id;
  console.log("hb", hubId);
  for (const meeting of meetings) {
    console.log("Processing meeting:", meeting);

    try {
      // Convert times to milliseconds
      const startTime = meeting.startTime
        ? new Date(meeting.startTime).getTime()
        : new Date().getTime(); // Use current time if no start time

      const endTime = meeting.endTime
        ? new Date(meeting.endTime).getTime()
        : startTime + 3600000; // Default to 1 hour duration if no end time

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: false, // Meetings are usually non-active after they occur
            type: "MEETING",
            timestamp: startTime, // Start time in milliseconds
          },
          associations: {
            companyIds: [hubId],
          },
          metadata: {
            body: meeting.body || "No body content",
            title: meeting.title || "No title",
            startTime, // Meeting start time in milliseconds
            endTime, // Meeting end time in milliseconds
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Meeting for Contact ${hubSpotContactId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing meeting for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

//<----------------------------------call for company----------------------------------------->
// Function to process call activities for contacts
async function processCallForCompanies(data1) {
  for (const data of data1) {
    //console.log("data------------------------>", data);
    const domain = data.properties.domain;
    const id = data.originalid;
    const companyName = data.properties.name;
    const calls = await fetchCompanyCallsFromHubSpot(data.originalid, SOURCE_ACCESS_TOKEN);
    // console.log(`Calls for Contact ${data.id}:`, calls);
    // Sync only the current call with HubSpot or perform further processing
    await syncCompanyCallsWithHubSpot(domain, companyName, calls);
  }
}
async function fetchCompanyCallsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching calls for contact ID:", dataId);
  console.log("SOURCE_ACCESS_TOKEN", SOURCE_ACCESS_TOKEN);
  try {
    // Step 1: Fetch call associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/companies/${dataId}/associations/calls`;
    console.log("SOURCE_ACCESS_TOKEN000000000", SOURCE_ACCESS_TOKEN);
    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Association Response:", associationResponse.data);

    const associatedCalls = associationResponse.data.results;
    if (!associatedCalls || associatedCalls.length === 0) {
      console.log("No calls associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed call properties
    const calls = await Promise.all(
      associatedCalls.map(async (callAssociation) => {
        const callId = callAssociation.toObjectId;
        const callDetailsUrl = `https://api.hubapi.com/engagements/v1/engagements/${callId}?properties=hs_timestamp,hs_call_status,hs_call_body,hs_call_subject,hs_call_recording_url`;

        try {
          const callDetailsResponse = await axios.get(callDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const callData = callDetailsResponse.data;
          console.log("callData", callData.engagement.id);
          return {
            timestamp: callData.engagement.createdAt || null,
            status: callData.metadata.status || "UNKNOWN", // Call status
            body: callData.metadata.body || "No notes available", // Call notes
            subject: callData.metadata.title || "No subject", // Call subject

          };
        } catch (error) {
          console.error(`Error fetching details for call ID ${callId}:`, error.message);
          return null; // Skip this call if there's an error
        }
      })
    );

    const filteredCalls = calls.filter((call) => call !== null); // Remove any null values
    console.log(`Fetched ${filteredCalls.length} calls for contact ${dataId}`);
    console.log("Call Details:", filteredCalls);

    return filteredCalls;
  } catch (error) {
    console.error(
      `Error fetching calls for HubSpot contact ${dataId}:`,
      // error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync call activities with HubSpot
async function syncCompanyCallsWithHubSpot(domain, companyName, calls) {
  console.log("domain------------->", domain);
  console.log("companyName", companyName);
  let hubSpotContactId
  if (domain) {
    console.log("domain------------->", domain);
    hubSpotContactId = await searchCompanyByDomain(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      domain,
      DESTINATION_ACCESS_TOKEN
    );
  }
  else {
    console.log("enter when doain not present")
    hubSpotContactId = await searchCompanyByCompanyName(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      companyName,
      DESTINATION_ACCESS_TOKEN
    );
  }
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for name: ${companyName}`);
    return;
  }

  console.log("hubSpotContactId", hubSpotContactId);
  const hubId = hubSpotContactId.results[0].id;
  console.log("hb", hubId);
  for (const call of calls) {
    // console.log("Processing call:", call);
    try {
      const timestamp = call.timestamp
        ? new Date(call.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true, // Assuming the call is active (can adjust based on your logic)
            type: "CALL",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            companyIds: [hubId],
          },
          metadata: {
            subject: call.subject || "No subject", // Call subject
            body: call.body || "No call notes available", // Call body
            status: call.status || "COMPLETED", // Ensure status is valid
            recordingUrl: call.recordingUrl || null, // Attach the call recording URL if available
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Call activity for Contact ${hubSpotContactId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing call activity for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
//<-----------------------------------email for company--------------------------------------->
async function fetchEmailsForCompanies(
  data1,
  sourceAccessToken,
  targetAccessToken
) {
  const results = [];

  for (const data of data1) {
    console.log("data", data);
    try {
      // Fetch engagements (tasks, emails, etc.) for each contact
      const url = `https://api.hubapi.com/engagements/v1/engagements/associated/COMPANY/${data.originalid}/paged?limit=100`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${sourceAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      // Filter for EMAIL engagements (email activities)
      const emails = response.data.results.filter(
        (engagement) => engagement.engagement.type === "EMAIL"
      );

      for (const email of emails) {
        console.log("Email Engagement: ", email);
        console.log(`EmailID: ${email.engagement.id}`);
        console.log(`Subject: ${email.metadata.subject}`);
        console.log(`Status: ${email.metadata.status}`);
        console.log(`Body: ${email.engagement.bodyPreview}`);
        console.log(`Timestamp: ${email.engagement.timestamp}`);
        const EmailID = email.engagement.id;
        const Subject = email.metadata.subject;
        const Status = email.metadata.status;
        const Body = email.engagement.bodyPreview;
        const Timestamp = email.engagement.timestamp

        // Get the company ID from associations
        const companyId = email.associations.companyIds[0];
        console.log("companyId", companyId);
        // Fetch the contact's email using the contact ID
        if (!companyId) {
          console.error("No associated contact ID found for this engagement.");
          continue;
        }

        const contactUrl = `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`;
        const contactResponse = await axios.get(contactUrl, {
          headers: {
            Authorization: `Bearer ${sourceAccessToken}`,
            "Content-Type": "application/json",
          },
        });
        console.log("contactResponse", contactResponse.data);
        const companyDomain = contactResponse.data.properties.domain;
        const companyName = contactResponse.data.properties.name;
        console.log("companyDomain------------", companyDomain);
        console.log("companyName--------", companyName)
        let hubSpotContactId
        if (companyDomain) {
          hubSpotContactId = await searchCompanyByDomain(
            'https://api.hubapi.com/crm/v3/objects/companies/search',
            companyDomain,
            DESTINATION_ACCESS_TOKEN
          );
        }
        else {
          console.log("enter when doain not present")
          hubSpotContactId = await searchCompanyByCompanyName(
            'https://api.hubapi.com/crm/v3/objects/companies/search',
            companyName,
            DESTINATION_ACCESS_TOKEN
          );
        }
        if (!hubSpotContactId) {
          console.error(`No HubSpot contact found for name: ${companyName}`);
          return;
        }

        console.log("hubSpotContactId", hubSpotContactId);
        const hubId = hubSpotContactId.results[0].id;
        console.log("hb", hubId);

        // if (getResponse.results.length === 0) {
        //   console.error(`HubSpot Contact Not Found for email: ${contactEmail}`);
        //   continue;
        // }

        // const hubSpotContactId = getResponse.results[0].id;
        // console.log(`HubSpot Contact ID for ${contactEmail}:`, hubSpotContactId);

        // // Handle email attachments if present
        if (email.attachments && email.attachments.length > 0) {
          console.log("email.attachments", email.attachments);
          for (const attachment of email.attachments) {
            try {
              // Step 1: Download the attachment from the source HubSpot
              const fileData = await downloadCompanyAttachment(
                attachment.id,
                sourceAccessToken
              );
              console.log(`Downloaded file ${attachment.id}`);

              // Step 2: Upload the attachment to the target HubSpot
              const uploadFileId = await uploadFileToCompanyHubSpot(fileData);
              console.log(`Uploaded file with ID ${uploadFileId}`);

              // Step 3: Create engagement with attachment in the target HubSpot
              await createEngagementWithCompanyAttachment(
                email,
                hubId,
                uploadFileId,
                targetAccessToken
              );
            } catch (error) {
              console.error(
                `Error syncing attachment ${attachment.id}:`,
                error.message
              );
            }
          }
        } else {
          // Sync email without attachments
          try {
            await createEngagementWithCompanyAttachment(
              email,
              hubId,
              null, // No attachment
              targetAccessToken
            );
          } catch (error) {
            console.error(`Error syncing email without attachments:`, error.message);
          }
        }
      }

      console.log(`Fetched ${emails.length} emails for contact ${data.id}`);
    } catch (error) {
      console.error(
        `Error fetching emails for contact ${data.id}:`,
        error.response ? error.response.data : error.message
      );
    }
  }

  return results;
}
const downloadCompanyAttachment = async (attachmentId, accessToken) => {
  try {
    const url = `https://api.hubapi.com/files/v3/files/${attachmentId}`;
    // Get file details
    const fileDetailsResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("File details:", fileDetailsResponse.data);

    const extension = fileDetailsResponse.data.extension || "unknown";
    if (!extension) {
      console.error(
        `Missing file extension for ${fileDetailsResponse.data.name}`
      );
      return null;
    }

    // Step 2: Generate signed download URL
    const signedUrlResponse = await axios.get(`${url}/signed-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const downloadUrl = signedUrlResponse.data.url; // Check if this is correct
    // console.log("downloadUrl+++++++++++++++++++++++", downloadUrl);
    const fileData = await axios.get(downloadUrl, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      responseType: "arraybuffer",
    });

    // console.log("fileData++++++++++++++++++", fileData.data);
    // const filePath = path.join(__dirname, 'downloads',`${fileDetailsResponse.data.name}.${extension}`);
    const filePath = path.join(
      __dirname,
      "downloads",
      `${fileDetailsResponse.data.name}.` +
      `${fileDetailsResponse.data.extension}`
    );
    // console.log("filePath-------------------->", filePath);
    fs.writeFileSync(filePath, fileData.data);
    console.log(`File saved successfully at: ${filePath}`);

    return filePath;
  } catch (error) {
    console.error(
      "Error downloading file:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
async function uploadFileToCompanyHubSpot(filePath) {
  console.log("filepath-------------->0,", filePath);
  try {
    const fileContent = fs.readFileSync(filePath);
    console.log("fileContent-----------------", fileContent);
    const fileName = path.basename(filePath);
    console.log("fileName------------------------", fileName);
    const hubspotUrl = `https://api.hubapi.com/files/v3/files`;

    const formData = new FormData();
    formData.append("file", fileContent, fileName);

    const folderPath = "/";
    formData.append("folderPath", folderPath);
    formData.append(
      "options",
      JSON.stringify({ access: "PRIVATE", folderPath })
    );

    const uploadResponse = await axios.post(hubspotUrl, formData, {
      headers: {
        Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
    });

    // fs.unlinkSync(filePath); // Ensure the file path variable is correct here
    // console.log("File uploaded to HubSpot:", hubspotResponse.data);
    console.log("uploadResponse", uploadResponse.data);
    return uploadResponse.data;
  } catch (error) {
    console.error(
      "Error uploading file to HubSpot:",
      error.response ? error.response.data : error.message
    );
  }
}
async function createEngagementWithCompanyAttachment(
  email,
  hubSpotContactId,
  uploadedFileId,
  accessToken
) {
  try {
    // console.log("uploadedFileId:", uploadedFileId);
    // console.log("email:", email);
    // console.log("hubSpotContactId:", hubSpotContactId);
    // console.log("accessToken:", accessToken);
    const emailBody = email.metadata.html || (email.metadata.text ? `<pre>${email.metadata.text}</pre>` : "No body content"); // Wrap plain text in <pre> for basic formatting
    const engagementData = {
      engagement: {
        active: true,
        type: "EMAIL",
        timestamp: email.engagement.createdAt, // Ensure this is a number
      },
      associations: {
        companyIds: [hubSpotContactId],
      },
      attachments: uploadedFileId
        ? [
          {
            id: typeof uploadedFileId === "object" ? uploadedFileId.id : uploadedFileId,
          },
        ]
        : [], // Only include attachments if uploadedFileId is provided
      metadata: {
        html: emailBody, // Use the formatted email body,
        // from: {
        //   email: email.FromAddress,
        // },
        subject: email.metadata.subject || "No subject content",
        // body: email.metadata.text || email.metadata.html || "No body content",
        // from: email.metadata.from || {}, // Sender's details
        to: email.metadata.to || [], // Recipients
        cc: email.metadata.cc || [], // CC recipients
        bcc: email.metadata.bcc || [], // BCC recipients
        sender: email.metadata.sender || {}, // Sender information
        text: email.metadata.text || "", // Plain text body
      },
    };

    // console.log(
    //   "Engagement data being sent:",
    //   JSON.stringify(engagementData, null, 2)
    // );

    const engagementResponse = await axios.post(
      "https://api.hubapi.com/engagements/v1/engagements",
      engagementData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `Email synced successfully with HubSpot for contact ID ${hubSpotContactId}.`
    );
  } catch (error) {
    console.error(
      `Error syncing email for contact ID ${hubSpotContactId}:`,
      error.response ? error.response.data : error.message
    );
  }
}




// Function to search for a deal by name in HubSpot
const searchDealByDealName = async (url, dealName, accessToken) => {
  console.log("Searching for deal with name:", dealName);
  try {
    const { data } = await axios.post(
      url,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "dealname", // Ensure this property matches the correct deal name property
                operator: "EQ",
                value: dealName,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log("Search results:", JSON.stringify(data, null, 2)); // Log full search response for debugging
    return data;
  } catch (error) {
    console.error(
      "Error searching for deal in HubSpot:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
const dealSchema = new mongoose.Schema({
  dealId: { type: Number, unique: true },
  dealName: String,
  addedToListOn: String,
  dealStage: String,
  pipeline: String,
  closeDate:String,
  dealOwner: String,
  Amount: String
});
const HubDealV2 = mongoose.model("HubDealV2", dealSchema);

// Define mappings for pipeline and deal stage
const pipelineMapping = {
  "Sales Pipeline": "default",
  "Historic":"888137960",
  "Client Services":"561278695"

};

const dealStageMapping = {
  "Sales Pipeline": {
      "Awaiting Feedback":"842063840",
      "Closed Lost":"842063845",
      "Closed won": "842063842",
      "Dormant":"842063845",
      "Opportunity Didn't Materialise":"842063844",
      "Pitch": "842063839",
      "Qualified Out":"842063845",
      "Sales Qualified Lead (SQL)":"appointmentscheduled",
      "Proposal":"842063839"
      
  },
  "Historic": {
      "Closed lost": "1251211503",
      "Closed won": "1251211502",
      "Qualified": "1274724564",
  },
  "Client Services": {
      "Awaiting Decision":"842177261",
      "Billing":"842031587",
      "Closed lost":"842177264",
      "Dormant":"842031588",
      "Identified Opportunity":"842177258",
      "Internal Brief / Costing":"842177259",
      "Proposal":"842177260",
      "Resourcing / Planning":"842177263",
      "Statement of Work":"842177262",
      
  }
};
// Route to fetch deals and save to the database
app.get("/fetch-deals", async (req, res) => {
  console.log("Entry point");
  fs.readFile("/home/astha-2757/Downloads/csvjson814.json", "utf8", async (err, data) => {
    if (err) throw err;

    // Parse and process the deals (limiting to the first 15 deals)
    const deals = JSON.parse(data).slice(0, 820);

    for (const deal of deals) {
      const newDealV3 = new HubDealV2({
        dealId: deal["Record ID"],
        dealName: deal["Deal Name"],
        addedToListOn: deal["Added To List On"],
        dealStage: deal["Deal Stage"],
        pipeline: deal["Pipeline"],
        closeDate: deal["Close Date"],
        dealOwner: deal["Deal owner"],
        Amount: deal["Amount"],
      });

      try {
        await newDealV3.save();
      } catch (error) {
        console.error("Error saving deal:", error.message);
      }
    }
    
    console.log("Deals saved successfully in HubCompaniesV2 collection!");
    res.status(200).send("Data saved to HubCompaniesV2 collection!");
  });
});
app.get("/deals", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 820;

    // Fetch deals from the database with pagination
    const dealsFromDB = await HubDealV2.find()
      .skip((page - 1) * limit)
      .limit(limit);
      const processedContacts = [];
    for (const deal of dealsFromDB) {
      // console.log("deal---------->",deal)
      try {
        const { dealId, dealName, pipeline, dealStage, Amount } = deal;
        // console.log(`Processing deal: ${dealName}`);
      const dealData1= await getDealById(dealId, SOURCE_ACCESS_TOKEN)
      const createdDate=dealData1.properties.createdate;
      const date = new Date(createdDate);
      const createDateTimestamp = date.getTime(); 

      const closeDate=dealData1.properties.closedate;
      const date1 = new Date(closeDate); 
      const createcloseDateTimestamp = date1.getTime(); 
      
        const mappedPipeline = pipelineMapping[pipeline] || "default-pipeline";
        const mappedDealStage =dealStageMapping[pipeline]?.[dealStage] || "default-stage";
    
        const dealData = {
          properties: {
           dealname: dealName,
            amount: Amount,
            createdate:createDateTimestamp,
            closedate:createcloseDateTimestamp,
            pipeline: mappedPipeline,
            dealstage: mappedDealStage,
          },
        };
        console.log("dealData",dealData);
        // Search for the deal in the destination portal
        const searchFilter = {
          filterGroups: [
            {
              filters: [{ propertyName: "dealname", operator: "EQ", value: dealName }],
            },
          ],
        };

        const searchResponse = await axios.post(
          `${BASE_URI}/crm/v3/objects/deals/search`,
          searchFilter,
          {
            headers: {
              Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );

        let globalHubspotDealId =
          searchResponse.data.results && searchResponse.data.results.length > 0
            ? searchResponse.data.results[0].id
            : null;

        if (globalHubspotDealId) {
          // Update the deal
          await axios.patch(
            `${BASE_URI}/crm/v3/objects/deals/${globalHubspotDealId}`,
            dealData,
            {
              headers: {
                Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log(`Deal "${dealName}" updated successfully.`);
        } else {
          console.log("enterrrrr");
          // Create the deal
          const createResponse = await axios.post(
            `${BASE_URI}/crm/v3/objects/deals`,
            dealData,
            {
              headers: {
                Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          globalHubspotDealId = createResponse.data.id;
          console.log(`Deal "${dealName}" created successfully.`);
        }
        console.log("globalHubspotDealId", globalHubspotDealId);
        // Associate contacts
        await associateContacts(dealId, globalHubspotDealId);
        // Associate companies
        await associateCompanies(dealId, globalHubspotDealId);
        processedContacts.push({
          dealId: dealId,
          properties: { name: dealName },
        });
    
      } catch (dealError) {
        console.error(`Error processing deal "${deal.dealName}": ${dealError.message}`);
      }
    }
    // Pass the processed contacts to processNotesForContacts
    await processNotesForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
    await processTaskForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
    await processMeetingForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
    await processCallForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
    await fetchEmailsForDeals(processedContacts, SOURCE_ACCESS_TOKEN, DESTINATION_ACCESS_TOKEN);
  } catch (error) {
    console.error(`Error fetching deals: ${error.message}`);
    res.status(500).send("An error occurred while processing deals.");
  }
});
// Function to get deal by ID
async function getDealById(dealId, accessToken) {
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`;
  
  try {
      const response = await fetch(url, {
          method: 'GET',
          headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
          }
      });

      if (!response.ok) {
          throw new Error(`Error fetching deal: ${response.status} - ${response.statusText}`);
      }

      const dealData = await response.json();
      return dealData;
  } catch (error) {
      console.error('Error:', error.message);
      return null;
  }
}
// Function to associate contacts with a deal
async function associateContacts(sourceDealId, destinationDealId) {
  try {
    // Fetch all contacts associated with the source deal
    const response = await axios.get(
      `${BASE_URI}/crm/v3/objects/deals/${sourceDealId}/associations/contact`,
      {
        headers: {
          Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    const associatedContacts = response.data.results;
    console.log("associatedContacts", associatedContacts)
    for (const contact of associatedContacts) {
      // Fetch contact email
      const contactEmail = await getContactEmail(contact.id);
      console.log("contactEmail", contactEmail);
      const contactEmailH = contactEmail.properties.email;
      console.log("contactEmailH", contactEmailH);
      if (contactEmailH) {
        // Search for the contact in the destination portal
        const destinationContact = await searchContactByEmail(
          `https://api.hubapi.com/crm/v3/objects/contacts/search`,
          contactEmailH,
          DESTINATION_ACCESS_TOKEN
        );
        console.log("destinationContact", destinationContact.results);
        if (destinationContact && destinationContact.results && destinationContact.results.length > 0) {
          const destinationContactId=destinationContact.results[0].id;
          // Create the association if contact exists
          console.log("hello..");
          console.log("destinationContact.id",destinationContactId)
          await createAssociation(destinationContactId, destinationDealId);
        } else {
          console.log("hi..");
          console.log("contactEmail----------", contactEmail);
          // Create new contact and associate if it doesn't exist
          const newContactId = await createNewContact(contactEmail);
          console.log("newContactId",newContactId);
          await createAssociation(newContactId, destinationDealId);
        }
      }
    }
  } catch (error) {
    console.error(`Error associating contacts: ${error.message}`);
  }
}

// Function to fetch a contact's email
async function getContactEmail(contactId) {
  try {
    // Fetch the contact from the source portal
    const contactResponse = await axios.get(
      `${BASE_URI}/crm/v3/objects/contacts/${contactId}`,
      {
        headers: {
          Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Return the email property
    return contactResponse.data;
  } catch (error) {
    console.error(`Error fetching contact email for ID ${contactId}: ${error.message}`);
    return null;
  }
}
// Function to create a new contact in the destination portal
async function createNewContact(contactEmail) {
  console.log("enterrrrrrrr");
  console.log("contactEmail", contactEmail);
  console.log(`Contact not found in destination for email: ${contactEmail.properties.email}. Creating new contact...`);

  const newContactData = {
    properties: {
      email: contactEmail.properties.email,
      firstname: contactEmail.properties.firstname || "N/A",
      lastname: contactEmail.properties.lastname || "N/A",
      phone: contactEmail.properties.phone || null,
    },
  };
  console.log("newContactData", newContactData);
  try {
    const createContactResponse = await axios.post(
      `${BASE_URI}/crm/v3/objects/contacts`, // Corrected quotes
      newContactData,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`, // Corrected quotes
          "Content-Type": "application/json",
        },
      }
    );

    const newContactId = createContactResponse.data.id;
    console.log(`Contact created successfully at destination: ${newContactId}`);
    return newContactId;
  } catch (error) {
    console.error(`Error creating contact: ${error.message}`);
    return null;
  }
}

async function createAssociation(newContactId, destinationDealId) {
  console.log("destinationDealId:", destinationDealId);
  console.log("newContactId:", newContactId);

  const associationPayload = [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 4, // Check that this associationTypeId matches the correct contact-deal association
    },
  ];

  try {
    // Associate the deal with the contact
    const response = await axios.put(
      `${BASE_URI}/crm/v4/objects/contacts/${newContactId}/associations/deals/${destinationDealId}`,
      associationPayload,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`, // Ensure correct string interpolation
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`Successfully associated deal ${destinationDealId} with contact ${newContactId}`);
    console.log("Association response:", response.data);
  } catch (error) {
    console.error(`Error creating association: ${error.message}`);
  }
}

// Function to associate companies with a deal
async function associateCompanies(sourceDealId, destinationDealId) {
  try {
    // Fetch all companies associated with the source deal
    const response = await axios.get(
      `${BASE_URI}/crm/v3/objects/deals/${sourceDealId}/associations/company`,
      {
        headers: {
          Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const associatedCompanies = response.data.results;
    console.log("associatedCompanies:", associatedCompanies);

    for (const company of associatedCompanies) {
      // Fetch company details
      const companyDetails = await getCompanyDetails(company.id);
      console.log("companyDetails:", companyDetails);

      // Search for the company in the destination portal by domain or name
      let destinationCompany = await searchCompanyByDomainOrName(
        companyDetails.properties.domain,
        companyDetails.properties.name
      );

      if (!destinationCompany) {
        console.log("Company not found in destination. Creating new company...");
        // Create a new company in the destination portal
        const newCompanyId = await createNewCompany(companyDetails);
        console.log("newCompanyId",newCompanyId);
        // Associate the new company with the destination deal
        await createCompanyAssociation(newCompanyId, destinationDealId);
      } else {
        console.log("Company found in destination:", destinationCompany);
        // Associate the existing company with the destination deal
        await createCompanyAssociation(destinationCompany.id, destinationDealId);
      }
    }
  } catch (error) {
    console.error(`Error associating companies: ${error.message}`);
  }
}

// Function to fetch company details from the source portal
async function getCompanyDetails(companyId) {
  try {
    const response = await axios.get(
      `${BASE_URI}/crm/v3/objects/companies/${companyId}`,
      {
        headers: {
          Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching company details for ID ${companyId}: ${error.message}`);
    return null;
  }
}

// Function to search for a company in the destination portal
async function searchCompanyByDomainOrName(domain, name) {
  try {
    // First, search by domain
    if (domain) {
      const domainSearchPayload = {
        filterGroups: [
          {
            filters: [
              { propertyName: "domain", operator: "EQ", value: domain },
            ],
          },
        ],
      };

      const domainSearchResponse = await axios.post(
        `${BASE_URI}/crm/v3/objects/companies/search`,
        domainSearchPayload,
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (
        domainSearchResponse.data.results &&
        domainSearchResponse.data.results.length > 0
      ) {
        return domainSearchResponse.data.results[0];
      }
    }

    // If not found by domain, search by name
    const nameSearchPayload = {
      filterGroups: [
        {
          filters: [
            { propertyName: "name", operator: "EQ", value: name },
          ],
        },
      ],
    };

    const nameSearchResponse = await axios.post(
      `${BASE_URI}/crm/v3/objects/companies/search`,
      nameSearchPayload,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (
      nameSearchResponse.data.results &&
      nameSearchResponse.data.results.length > 0
    ) {
      return nameSearchResponse.data.results[0];
    }

    return null;
  } catch (error) {
    console.error(`Error searching company by domain or name: ${error.message}`);
    return null;
  }
}

// Function to create a new company in the destination portal
async function createNewCompany(companyDetails) {
  const newCompanyData = {
    properties: {
      name: companyDetails.properties.name || "Unknown",
      domain: companyDetails.properties.domain || null,
      phone: companyDetails.properties.phone || null,
      city: companyDetails.properties.city || null,
    },
  };

  try {
    const response = await axios.post(
      `${BASE_URI}/crm/v3/objects/companies`,
      newCompanyData,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Company created successfully:", response.data.id);
    return response.data.id;
  } catch (error) {
    console.error(`Error creating company: ${error.message}`);
    return null;
  }
}

// Function to create an association between a company and a deal
async function createCompanyAssociation(companyId, dealId) {
  const associationPayload = [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 342, // Check if this ID matches company-deal association
    },
  ];

  try {
    const response = await axios.put(
      `${BASE_URI}/crm/v4/objects/companies/${companyId}/associations/deals/${dealId}`,
      associationPayload,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(
      `Successfully associated deal ${dealId} with company ${companyId}`
    );
    console.log("Association response:", response.data);
  } catch (error) {
    console.error(
      `Error creating association between company and deal: ${error.message}`
    );
  }
}



// async function createNewContact(contactEmail){
//   // console.log(Contact not found in destination for email: ${contactEmail}. Creating new contact...);
//   // console.log("existingDeal", existingDeal);
//   const newContactData = {
//     properties: {
//       email: contactEmail,
//       firstname: contactResponse.data.properties.firstname || "N/A",
//       lastname: contactResponse.data.properties.lastname || "N/A",
//       phone: contactResponse.data.properties.phone || null,
//     },
//   };

//   try {
//     const createContactResponse = await axios.post(
//       `${BASE_URI}/crm/v3/objects/contacts`,
//       newContactData,
//       {
//         headers: {
//           Authorization: Bearer ${DESTINATION_ACCESS_TOKEN},
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     const newContactId = createContactResponse.data.id;
//     console.log(Contact created successfully at destination: ${newContactId});

// }
// Define additional modular functions like `associateCompanies`, `getContactEmail`, `searchContactByEmail`, etc.


// app.get("/deals", async (req, res) => {
//   console.log("enterrr");
//   let globalHubspotDealId; 
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;

//     // Fetch companies from the database with pagination
//     const dealsFromDB = await HubDealV2.find()
//       .skip((page - 1) * limit)
//       .limit(limit);

//     const processedContacts = [];
//     for (const deal of dealsFromDB) {
//       console.log("deal///////////////////", deal);
//       console.log("Fetched deals:", deal);
//       try {
//         const dealId = deal.dealId;
//         console.log("dealId", dealId);
//         const dealName = deal.dealName;
//         // Map pipeline and deal stage
//         const mappedPipeline = pipelineMapping[deal.pipeline] || "default-pipeline-id-destination";
//         console.log("mappedPipeline", mappedPipeline);
//         const mappedDealStage = dealStageMapping[deal.dealStage] || "default-stage-id-destination";
//         console.log("mappedDealStage", mappedDealStage);
//         const dealData = {
//           properties: {
//             dealname: deal.dealName,
//             amount: deal.Amount,
//             pipeline: mappedPipeline,
//             dealstage: mappedDealStage,
//           },
//         };

//         console.log("Processing deal:", dealName);
//         // Search for the deal in the destination portal
//         const searchFilter = {
//           filterGroups: [
//             {
//               filters: [
//                 { propertyName: "dealname", operator: "EQ", value: dealName },
//               ],
//             },
//           ],
//         };

//         const searchResponse = await axios.post(
//           `${BASE_URI}/crm/v3/objects/deals/search`,
//           searchFilter,
//           {
//             headers: {
//               Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );
//         console.log("Search filter:", searchFilter);
//         console.log("Search response:", searchResponse.data);
//         const globalHubspotDealId =
//           searchResponse.data.results && searchResponse.data.results.length > 0
//             ? searchResponse.data.results[0]
//             : null;
//         console.log("globalHubspotDealId", globalHubspotDealId);
//         let createResponse;
//         if(globalHubspotDealId){
//           // Update the deal
//           console.log("DESTINATION_ACCESS_TOKEN",DESTINATION_ACCESS_TOKEN);
//           createResponse = await axios.patch(
//             `${BASE_URI}/crm/v3/objects/deals/${existingDeal.id}`,
//             dealData,
//             {
//               headers: {
//                 Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                 "Content-Type": "application/json",
//               },
//             }
//           );
//           console.log(`Deal "${existingDeal.id}" updated successfully.`);
//         }
//         else {
//           try {
//             console.log("enterrrrrrrrrrrrrrrrrrrrrrrrrrrrrr");
//             console.log("dealData", dealData);
//             // Create a new deal
//             createResponse = await axios.post(
//               `${BASE_URI}/crm/v3/objects/deals`,
//               dealData,
//               {
//                 headers: {
//                   Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                   "Content-Type": "application/json",
//                 },
//               }
//             );
//             console.log("dealdetails", createResponse.data.id);
//             globalHubspotDealId=createResponse.data.id
//             console.log("globalHubspotDealId",globalHubspotDealId);
//             console.log(`Deal "${dealName}" created successfully.`);



//           }
//           catch (error) {
//             console.log(error.message);
//           }
//         }
//         // create association with contact
//         try {
//           console.log("ENTER AT CONTACT ASSOCIATION---------------------------->")
//           // Fetch contact associated with the deal
//           console.log("dealId--------?", dealId);
//           console.log("globalHubspotDealId",globalHubspotDealId);
//           const response = await axios.get(
//             `${BASE_URI}/crm/v3/objects/deals/${dealId}/associations/contact`,
//             {
//               headers: {
//                 Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
//                 "Content-Type": "application/json",
//               },
//             }
//           );
//           const associatedContacts = response.data.results;
//           console.log("associatedContacts", associatedContacts);
//           for (const contact of associatedContacts) {
//             try {
//               const contactId = contact.id;

//               // Fetch the contact from the source to get unique fields like email
//               const contactResponse = await axios.get(
//                 `${BASE_URI}/crm/v3/objects/contacts/${contactId}`,
//                 {
//                   headers: {
//                     Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );

//               const contactEmail = contactResponse.data.properties.email;
//               console.log("contactEmail", contactEmail);
//               // Search for the contact in the destination
//               if (contactEmail) {
//                 const searchFilter = {
//                   filterGroups: [
//                     {
//                       filters: [
//                         { propertyName: "email", operator: "EQ", value: contactEmail },
//                       ],
//                     },
//                   ],
//                 };

//                 const destinationContactResponse = await axios.post(
//                   `${BASE_URI}/crm/v3/objects/contacts/search`,
//                   searchFilter,
//                   {
//                     headers: {
//                       Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                       "Content-Type": "application/json",
//                     },
//                   }
//                 );
//                 console.log("destinationContactResponse", destinationContactResponse.data.results);
//                 const destinationContact =
//                   destinationContactResponse.data.results &&
//                     destinationContactResponse.data.results.length > 0
//                     ? destinationContactResponse.data.results[0]
//                     : null;

//                 if (destinationContact) {
//                   console.log(`Contact exists in destination: ${destinationContact.id}`);
//                   console.log("existingDeal", existingDeal);
//                   try {
//                     const associationPayload = [
//                       {
//                         associationCategory: "HUBSPOT_DEFINED",
//                         associationTypeId: 4,
//                       },
//                     ];
//                     // Associate the deal with the contact
//                     await axios.put(
//                       `${BASE_URI}/crm/v4/objects/contact/${destinationContact.id}/associations/deal/${existingDeal.id}`,
//                       associationPayload,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );
//                      console.log(
//                     `Successfully associated deal ${dealId} with contact ${destinationContact.id}`
//                   );
//                   }
//                   catch (error) {
//                     console.log(error.message);
//                   }
//                 }
//                 else {
//                   console.log(`Contact not found in destination for email: ${contactEmail}. Creating new contact...`);
//                   console.log("existingDeal", existingDeal);
//                   const newContactData = {
//                     properties: {
//                       email: contactEmail,
//                       firstname: contactResponse.data.properties.firstname || "N/A",
//                       lastname: contactResponse.data.properties.lastname || "N/A",
//                       phone: contactResponse.data.properties.phone || null,
//                     },
//                   };

//                   try {
//                     const createContactResponse = await axios.post(
//                       `${BASE_URI}/crm/v3/objects/contacts`,
//                       newContactData,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );

//                     const newContactId = createContactResponse.data.id;
//                     console.log(`Contact created successfully at destination: ${newContactId}`);

//                     // Ensure you're using the correct destination deal ID
//                     // const destinationDealId = existingDeal ? existingDeal.id : createResponse.data.id;
//                       // console.log("DealId--------------", existingDeal.id);
//                       console.log("newContactId",newContactId);
//                       console.log("existingDealId",existingDeal.id);
//                       const associationPayload = [
//                         {
//                           associationCategory: "HUBSPOT_DEFINED",
//                           associationTypeId: 4,
//                         },
//                       ];
//                       // Associate the deal with the contact
//                       await axios.put(
//                         `${BASE_URI}/crm/v4/objects/contact/${newContactId}/associations/deal/${existingDeal.id}`,
//                         associationPayload,
//                         {
//                           headers: {
//                             Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                             "Content-Type": "application/json",
//                           },
//                         }
//                       );
//                        console.log(
//                       `Successfully associated deal ${existingDeal.id} with contact ${newContactId}`);

//                   } catch (createError) {
//                     console.error(`Error creating contact at destination: ${createError.message}`);
//                   }
//                 }

//               } else {
//                 console.log(`Contact not found in destination for email: ${contactEmail}`);
//               }
//             } catch (error) {
//               console.error(`Error associating contact with deal: ${error.message}`);
//             }
//           }

//         }
//         catch (error) {
//           console.log(`Error processing contact association items for deal ${dealName}: ${error.message}`);
//         }
//         // create association with company
//         try {
//           console.log("dealId--------?", dealId); // Replace with the actual deal ID

//           // Fetch companies associated with the deal
//           const response = await axios.get(
//             `${BASE_URI}/crm/v3/objects/deals/${dealId}/associations/company`,
//             {
//               headers: {
//                 Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
//                 "Content-Type": "application/json",
//               },
//             }
//           );

//           const associatedCompanies = response.data.results; // This will contain company IDs
//           console.log("associatedCompanies", associatedCompanies);

//           for (const company of associatedCompanies) {
//             console.log("company", company);
//             const companyId = company.id;
//             try {
//               // Fetch the company from the source to get unique fields like domain
//               const companyResponse = await axios.get(
//                 `${BASE_URI}/crm/v3/objects/companies/${companyId}`,
//                 {
//                   headers: {
//                     Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );
//               console.log("details", companyResponse.data.properties);
//               const companyDomain = companyResponse.data.properties.domain;
//               console.log("companyDomain", companyDomain);
//               const companyName = companyResponse.data.properties.name;
//               console.log("companyName", companyName);
//               // Search for the company in the destination
//               if (companyDomain) {
//                 const searchFilter = {
//                   filterGroups: [
//                     {
//                       filters: [
//                         { propertyName: "domain", operator: "EQ", value: companyDomain },
//                       ],
//                     },
//                   ],
//                 }

//                 const destinationCompanyResponse = await axios.post(
//                   `${BASE_URI}/crm/v3/objects/companies/search`,
//                   searchFilter,
//                   {
//                     headers: {
//                       Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                       "Content-Type": "application/json",
//                     },
//                   }
//                 );

//                 console.log(
//                   "destinationCompanyResponse",
//                   destinationCompanyResponse.data.results
//                 );

//                 const destinationCompany =
//                   destinationCompanyResponse.data.results &&
//                     destinationCompanyResponse.data.results.length > 0
//                     ? destinationCompanyResponse.data.results[0]
//                     : null;

//                 if (destinationCompany) {
//                   console.log(`Company exists in destination: ${destinationCompany.id}`);

//                   const associationPayload = [
//                     {
//                       associationCategory: "HUBSPOT_DEFINED",
//                       associationTypeId: 342, // Use the correct association type for company-deal
//                     },
//                   ];

//                   // Associate the deal with the company
//                   await axios.put(
//                     `${BASE_URI}/crm/v4/objects/company/${destinationCompany.id}/associations/deal/${existingDeal.id}`,
//                     associationPayload,
//                     {
//                       headers: {
//                         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                         "Content-Type": "application/json",
//                       },
//                     }
//                   );

//                   console.log(
//                     `Successfully associated deal ${dealId} with company ${destinationCompany.id}`
//                   );
//                 } else {
//                   console.log(
//                     `Company not found in destination for domain: ${companyDomain}. Creating new company...`
//                   );

//                   const newCompanyData = {
//                     properties: {
//                       domain: companyDomain,
//                       name: companyResponse.data.properties.name || "N/A",
//                       phone: companyResponse.data.properties.phone || null,
//                       website: companyResponse.data.properties.website || null,
//                     },
//                   };

//                   try {
//                     const createCompanyResponse = await axios.post(
//                       `${BASE_URI}/crm/v3/objects/companies`,
//                       newCompanyData,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );

//                     const newCompanyId = createCompanyResponse.data.id;
//                     console.log(
//                       `Company created successfully at destination: ${newCompanyId}`
//                     );

//                     const associationPayload = [
//                       {
//                         associationCategory: "HUBSPOT_DEFINED",
//                         associationTypeId: 4,
//                       },
//                     ];

//                     // Associate the deal with the newly created company
//                     await axios.put(
//                       `${BASE_URI}/crm/v4/objects/company/${newCompanyId}/associations/deal/${existingDeal.id}`,
//                       associationPayload,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );

//                     console.log(
//                       `Successfully associated deal ${dealId} with new company ${newCompanyId}`
//                     );
//                   } catch (createError) {
//                     console.error(
//                       `Error creating company at destination: ${createError.message}`
//                     );
//                   }
//                 }
//               }
//               else {
//                 const searchFilter = {
//                   filterGroups: [
//                     {
//                       filters: [
//                         { propertyName: "name", operator: "EQ", value: companyName },
//                       ],
//                     },
//                   ],
//                 }

//                 const destinationCompanyResponse = await axios.post(
//                   `${BASE_URI}/crm/v3/objects/companies/search`,
//                   searchFilter,
//                   {
//                     headers: {
//                       Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                       "Content-Type": "application/json",
//                     },
//                   }
//                 );

//                 console.log(
//                   "destinationCompanyResponse",
//                   destinationCompanyResponse.data.results
//                 );

//                 const destinationCompany =
//                   destinationCompanyResponse.data.results &&
//                     destinationCompanyResponse.data.results.length > 0
//                     ? destinationCompanyResponse.data.results[0]
//                     : null;

//                 if (destinationCompany) {
//                   console.log(`Company exists in destination: ${destinationCompany.id}`);

//                   const associationPayload = [
//                     {
//                       associationCategory: "HUBSPOT_DEFINED",
//                       associationTypeId: 342,
//                     },
//                   ];

//                   // Associate the deal with the company
//                   await axios.put(
//                     `${BASE_URI}/crm/v4/objects/company/${destinationCompany.id}/associations/deal/${existingDeal.id}`,
//                     associationPayload,
//                     {
//                       headers: {
//                         Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                         "Content-Type": "application/json",
//                       },
//                     }
//                   );

//                   console.log(
//                     `Successfully associated deal ${dealId} with company ${destinationCompany.id}`
//                   );
//                 } else {
//                   console.log(
//                     `Company not found in destination for domain: ${companyDomain}. Creating new company...`
//                   );

//                   const newCompanyData = {
//                     properties: {
//                       domain: companyDomain,
//                       name: companyResponse.data.properties.name || "N/A",
//                       phone: companyResponse.data.properties.phone || null,
//                       website: companyResponse.data.properties.website || null,
//                     },
//                   };

//                   try {
//                     const createCompanyResponse = await axios.post(
//                       `${BASE_URI}/crm/v3/objects/companies`,
//                       newCompanyData,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );

//                     const newCompanyId = createCompanyResponse.data.id;
//                     console.log(
//                       `Company created successfully at destination: ${newCompanyId}`
//                     );

//                     const associationPayload = [
//                       {
//                         associationCategory: "HUBSPOT_DEFINED",
//                         associationTypeId: 342,
//                       },
//                     ];

//                     // Associate the deal with the newly created company
//                     await axios.put(
//                       `${BASE_URI}/crm/v4/objects/company/${newCompanyId}/associations/deal/${existingDeal.id}`,
//                       associationPayload,
//                       {
//                         headers: {
//                           Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
//                           "Content-Type": "application/json",
//                         },
//                       }
//                     );

//                     console.log(
//                       `Successfully associated deal ${dealId} with new company ${newCompanyId}`
//                     );
//                   } catch (createError) {
//                     console.error(
//                       `Error creating company at destination: ${createError.message}`
//                     );
//                   }
//                 }
//               }
//             } catch (error) {
//               console.error(`Error associating company with deal: ${error.message}`);
//             }
//           }
//         } catch (error) {
//           console.error(
//             `Error processing companies for deal ${dealId}: ${error.message}`
//           );
//         }
//         // console.log("dealId", dealId);
//         // console.log("dealName", dealName);
//         // // Add company to the processedContacts array
//         processedContacts.push({
//           dealId: dealId,
//           properties: { name: dealName },
//         });
//       }
//       catch (error) {
//         console.log(`Error processing line items for deal ${dealName}: ${error.message}`);
//       }

//       // console.log("processedContacts", processedContacts);
//     }
//     // Pass the processed contacts to processNotesForContacts
//     // await processNotesForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
//     // await processTaskForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
//     // await processMeetingForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
//     // await processCallForDeals(processedContacts, SOURCE_ACCESS_TOKEN);
//     // await fetchEmailsForDeals(processedContacts, SOURCE_ACCESS_TOKEN, DESTINATION_ACCESS_TOKEN);
//     res.status(200).json({ message: "Companies processed successfully!" });
//   } catch (error) {
//     console.log("Error fetching companies:", error.message);
//     res.status(500).json({ message: "Error fetching companies" });
//   }
// });

//<---------------------------------Notes for Deals------------------------------------------>
async function processNotesForDeals(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const id = data.dealId;
    const dealName = data.properties.name;
    console.log("id", id);
    console.log("dealName", dealName);
    const notes = await fetchDealsNotesFromHubSpot(data.dealId, SOURCE_ACCESS_TOKEN);
    // Sync only the current note with HubSpot or perform further processing
    await syncDealsNotesWithHubSpot(dealName, notes);
  }
}
//Function to fetch all notes from salesforce
async function fetchDealsNotesFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching notes for contact ID:", dataId);

  try {
    console.log("enter-----------");
    console.log("SOURCE_ACCESS_TOKEN", SOURCE_ACCESS_TOKEN);
    // Step 1: Fetch note associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/deals/${dataId}/associations/notes`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedNotes = associationResponse.data.results;
    console.log("associatedNotes", associatedNotes);
    if (!associatedNotes || associatedNotes.length === 0) {
      console.log("No notes associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed note properties
    const notes = await Promise.all(
      associatedNotes.map(async (noteAssociation) => {
        const noteId = noteAssociation.toObjectId;
        const noteDetailsUrl = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_timestamp,hs_note_body,hs_note_subject`;

        try {
          const noteDetailsResponse = await axios.get(noteDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const noteData = noteDetailsResponse.data;
          console.log("noteData", noteData);
          return {
            id: noteId,
            timestamp: noteData.properties.hs_timestamp || null, // Note timestamp
            body: noteData.properties.hs_note_body || "No body content", // Note body
            subject: noteData.properties.hs_note_subject || "No subject", // Note subject
          };
        } catch (error) {
          console.error(`Error fetching details for note ID ${noteId}:`, error.message);
          return null; // Skip this note if there's an error
        }
      })
    );

    const filteredNotes = notes.filter((note) => note !== null); // Remove any null values
    console.log(`Fetched ${filteredNotes.length} notes for contact ${dataId}`);
    console.log("Note Details:", filteredNotes);

    return filteredNotes;
  } catch (error) {
    console.error(
      `Error fetching notes for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
async function syncDealsNotesWithHubSpot(dealName, notes) {
  console.log("Searching for deal with name:", dealName);

  // Fetch deal ID from HubSpot by deal name
  const hubSpotDeal = await searchDealByDealName(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    dealName,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotDeal || !hubSpotDeal.results || hubSpotDeal.results.length === 0) {
    console.error(`No HubSpot deal found for name: ${dealName}`);
    return;
  }

  // Get the deal ID
  const hubSpotDealId = hubSpotDeal.results[0].id;
  console.log("HubSpot Deal ID:", hubSpotDealId);

  // Loop through notes and sync them with HubSpot
  for (const note of notes) {
    console.log("Processing note:", note);

    try {
      // Convert `timestamp` to milliseconds
      const timestamp = note.timestamp
        ? new Date(note.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      console.log("Timestamp:", timestamp);

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "NOTE",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            dealIds: [hubSpotDealId], // Associate with the deal
          },
          metadata: {
            body: note.body || "No body content", // Note content
            subject: note.subject || "No subject", // Note subject
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        `Note synced successfully with deal ${hubSpotDealId}:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing note for deal ${hubSpotDealId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
//<---------------------------------Tasks for Deals------------------------------------------>
// Function to process tasks for contacts
async function processTaskForDeals(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const id = data.dealId;
    const dealName = data.properties.name;
    console.log("id", id);
    console.log("dealName", dealName);
    const tasks = await fetchDealsTasksFromHubSpot(data.dealId, SOURCE_ACCESS_TOKEN);
    console.log(`Tasks for Contact ${data.dealId}:`, tasks);
    // Sync only the current task with HubSpot or perform further processing
    await syncDealsTasksWithHubSpot(dealName, tasks);
  }
}
async function fetchDealsTasksFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching tasks for contact ID:", dataId);

  try {
    // Step 1: Fetch task associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/deals/${dataId}/associations/tasks`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedTasks = associationResponse.data.results;
    console.log("associatedTasks", associatedTasks);
    if (!associatedTasks || associatedTasks.length === 0) {
      console.log("No tasks associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed task properties
    const tasks = await Promise.all(
      associatedTasks.map(async (taskAssociation) => {
        const taskId = taskAssociation.toObjectId;
        const taskDetailsUrl = `https://api.hubapi.com/crm/v3/objects/tasks/${taskId}?properties=hs_timestamp,hs_task_status,hs_task_priority,hs_task_body,hs_task_subject,hs_task_type`;

        try {
          const taskDetailsResponse = await axios.get(taskDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const taskData = taskDetailsResponse.data;
          console.log("taskData", taskData);
          return {
            id: taskId,
            timestamp: taskData.properties.hs_timestamp || null, // Task timestamp
            status: taskData.properties.hs_task_status || "UNKNOWN", // Task status
            priority: taskData.properties.hs_task_priority || "NONE", // Task priority
            body: taskData.properties.hs_task_body || "No body content", // Task body
            subject: taskData.properties.hs_task_subject || "No subject", // Task subject
            type: taskData.properties.hs_task_type || "TODO", // Task type
          };
        } catch (error) {
          console.error(`Error fetching details for task ID ${taskId}:`, error.message);
          return null; // Skip this task if there's an error
        }
      })
    );

    const filteredTasks = tasks.filter((task) => task !== null); // Remove any null values
    console.log(`Fetched ${filteredTasks.length} tasks for contact ${dataId}`);
    console.log("Task Details:", filteredTasks);

    return filteredTasks;
  } catch (error) {
    console.error(
      `Error fetching tasks for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync tasks with HubSpot
async function syncDealsTasksWithHubSpot(dealName, tasks) {
  // Fetch deal ID from HubSpot by deal name
  const hubSpotDeal = await searchDealByDealName(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    dealName,
    DESTINATION_ACCESS_TOKEN
  );
  if (!hubSpotDeal || !hubSpotDeal.results || hubSpotDeal.results.length === 0) {
    console.error(`No HubSpot deal found for name: ${dealName}`);
    return;
  }

  // Get the deal ID
  const hubSpotDealId = hubSpotDeal.results[0].id;
  console.log("HubSpot Deal ID:", hubSpotDealId);

  for (const task of tasks) {
    console.log("Processing task:", task);

    try {
      const isCompleted = task.status === "COMPLETED";

      // Convert `timestamp` to milliseconds
      const timestamp = task.timestamp
        ? new Date(task.timestamp).getTime()
        : new Date().getTime(); // Use current time if no timestamp

      const completionDate = isCompleted
        ? task.lastUpdated
          ? new Date(task.lastUpdated).getTime()
          : new Date(task.createdAt).getTime()
        : null; // Convert `completionDate` to milliseconds

      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: !isCompleted, // Active tasks are considered "open"
            type: "TASK",
            timestamp, // Send timestamp in milliseconds
          },
          associations: {
            dealIds: [hubSpotDealId], // Use dealIds for associations
          },
          metadata: {
            subject: task.subject || "No subject",
            body: task.body || "No body content",
            status: task.status || "NOT_STARTED", // Ensure status is valid
            taskType: task.taskType || "TODO",
            completionDate, // Send completionDate in milliseconds if applicable
            priority: task.priority || "NONE",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Task synced successfully with deal ${hubSpotDealId}:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing task for deal ${hubSpotDealId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

//<----------------------------------Meeting for Deals-------------------------------------->
// Function to process meetings for contacts
async function processMeetingForDeals(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const id = data.dealId;
    const dealName = data.properties.name;
    console.log("id", id);
    console.log("dealName", dealName);
    const meetings = await fetchDealsMeetingsFromHubSpot(data.dealId, SOURCE_ACCESS_TOKEN);
    // Sync only the current meeting with HubSpot or perform further processing
    await syncDealsMeetingsWithHubSpot(dealName, meetings);
  }
}
// Function to fetch meetings from HubSpot
async function fetchDealsMeetingsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching meetings for contact ID:", dataId);

  try {
    // Step 1: Fetch meeting associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/deals/${dataId}/associations/meetings`;

    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const associatedMeetings = associationResponse.data.results;
    console.log("associatedMeetings", associatedMeetings);
    if (!associatedMeetings || associatedMeetings.length === 0) {
      console.log("No meetings associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed meeting properties
    const meetings = await Promise.all(
      associatedMeetings.map(async (meetingAssociation) => {
        const meetingId = meetingAssociation.toObjectId;
        const meetingDetailsUrl = `https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_body,hs_meeting_title,hs_meeting_start_time,hs_meeting_end_time`;

        try {
          const meetingDetailsResponse = await axios.get(meetingDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const meetingData = meetingDetailsResponse.data;
          console.log("meetingData", meetingData);
          return {
            id: meetingId,
            body: meetingData.properties.hs_meeting_body || "No body content", // Meeting body
            title: meetingData.properties.hs_meeting_title || "No title", // Meeting title
            startTime: meetingData.properties.hs_meeting_start_time || null, // Start time
            endTime: meetingData.properties.hs_meeting_end_time || null, // End time
          };
        } catch (error) {
          console.error(`Error fetching details for meeting ID ${meetingId}:`, error.message);
          return null; // Skip this meeting if there's an error
        }
      })
    );

    const filteredMeetings = meetings.filter((meeting) => meeting !== null); // Remove any null values
    console.log(`Fetched ${filteredMeetings.length} meetings for contact ${dataId}`);
    console.log("Meeting Details:", filteredMeetings);

    return filteredMeetings;
  } catch (error) {
    console.error(
      `Error fetching meetings for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync meetings with HubSpot
async function syncDealsMeetingsWithHubSpot(dealName, meetings) {
  console.log("dealName", dealName);

  // Search for the HubSpot deal by name
  const hubSpotDeal = await searchDealByDealName(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    dealName,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotDeal || !hubSpotDeal.results || hubSpotDeal.results.length === 0) {
    console.error(`No HubSpot deal found for name: ${dealName}`);
    return;
  }

  // Extract the deal ID
  const hubSpotDealId = hubSpotDeal.results[0].id;
  console.log("HubSpot Deal ID:", hubSpotDealId);

  for (const meeting of meetings) {
    console.log("Processing meeting:", meeting);

    try {
      // Convert times to milliseconds
      const startTime = meeting.startTime
        ? new Date(meeting.startTime).getTime()
        : new Date().getTime(); // Use current time if no start time

      const endTime = meeting.endTime
        ? new Date(meeting.endTime).getTime()
        : startTime + 3600000; // Default to 1 hour duration if no end time

      // Create the meeting in HubSpot
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: false, // Meetings are usually non-active after they occur
            type: "MEETING",
            timestamp: startTime, // Start time in milliseconds
          },
          associations: {
            dealIds: [hubSpotDealId], // Use dealIds for associations
          },
          metadata: {
            body: meeting.body || "No body content",
            title: meeting.title || "No title",
            startTime, // Meeting start time in milliseconds
            endTime, // Meeting end time in milliseconds
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Meeting for Deal ${hubSpotDealId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing meeting for Deal ${hubSpotDealId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

//<----------------------------------call for Deals----------------------------------------->
// Function to process call activities for contacts
async function processCallForDeals(data1) {
  for (const data of data1) {
    console.log("data------------------------>", data);
    const id = data.dealId;
    const dealName = data.properties.name;
    console.log("id", id);
    console.log("dealName", dealName);
    const calls = await fetchDealsCallsFromHubSpot(data.dealId, SOURCE_ACCESS_TOKEN);
    // console.log(`Calls for Contact ${data.id}:`, calls);
    // Sync only the current call with HubSpot or perform further processing
    await syncDealsCallsWithHubSpot(dealName, calls);
  }
}
async function fetchDealsCallsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  console.log("Fetching calls for contact ID:", dataId);
  console.log("SOURCE_ACCESS_TOKEN", SOURCE_ACCESS_TOKEN);
  try {
    // Step 1: Fetch call associations
    const associationsUrl = `https://api.hubapi.com/crm/v4/objects/deals/${dataId}/associations/calls`;
    // console.log("SOURCE_ACCESS_TOKEN000000000", SOURCE_ACCESS_TOKEN);
    const associationResponse = await axios.get(associationsUrl, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Association Response:", associationResponse.data);

    const associatedCalls = associationResponse.data.results;
    if (!associatedCalls || associatedCalls.length === 0) {
      console.log("No calls associated with this contact.");
      return [];
    }

    // Step 2: Fetch detailed call properties
    const calls = await Promise.all(
      associatedCalls.map(async (callAssociation) => {
        const callId = callAssociation.toObjectId;
        const callDetailsUrl = `https://api.hubapi.com/engagements/v1/engagements/${callId}?properties=hs_timestamp,hs_call_status,hs_call_body,hs_call_subject,hs_call_recording_url`;

        try {
          const callDetailsResponse = await axios.get(callDetailsUrl, {
            headers: {
              Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          });

          // Extract desired properties
          const callData = callDetailsResponse.data;
          console.log("callData", callData.engagement.id);
          return {
            timestamp: callData.engagement.createdAt || null,
            status: callData.metadata.status || "UNKNOWN", // Call status
            body: callData.metadata.body || "No notes available", // Call notes
            subject: callData.metadata.title || "No subject", // Call subject

          };
        } catch (error) {
          console.error(`Error fetching details for call ID ${callId}:`, error.message);
          return null; // Skip this call if there's an error
        }
      })
    );

    const filteredCalls = calls.filter((call) => call !== null); // Remove any null values
    console.log(`Fetched ${filteredCalls.length} calls for contact ${dataId}`);
    console.log("Call Details:", filteredCalls);

    return filteredCalls;
  } catch (error) {
    console.error(
      `Error fetching calls for HubSpot contact ${dataId}:`,
      // error.response ? error.response.data : error.message
    );
    return [];
  }
}
// Function to sync call activities with HubSpot
async function syncDealsCallsWithHubSpot(dealName, calls) {
  console.log("dealName", dealName);

  // Search for the HubSpot deal by name
  const hubSpotDeal = await searchDealByDealName(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    dealName,
    DESTINATION_ACCESS_TOKEN
  );

  if (!hubSpotDeal || !hubSpotDeal.results || hubSpotDeal.results.length === 0) {
    console.error(`No HubSpot deal found for name: ${dealName}`);
    return;
  }

  // Extract the deal ID
  const hubSpotDealId = hubSpotDeal.results[0].id;
  console.log("HubSpot Deal ID:", hubSpotDealId);

  for (const call of calls) {
    console.log("Processing call:", call);

    try {
      // Convert timestamp to milliseconds
      const timestamp = call.timestamp
        ? new Date(call.timestamp).getTime()
        : new Date().getTime(); // Default to current time if no timestamp is provided

      // Prepare API request
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: false, // Calls are typically not active after being logged
            type: "CALL",
            timestamp, // Call timestamp in milliseconds
          },
          associations: {
            dealIds: [hubSpotDealId], // Correct association for deals
          },
          metadata: {
            subject: call.subject || "No subject provided", // Call subject
            body: call.body || "No call notes available", // Call notes
            status: call.status || "COMPLETED", // Default status
            recordingUrl: call.recordingUrl || null, // Attach call recording URL if available
          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        `Call activity for Deal ${hubSpotDealId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing call activity for Deal ${hubSpotDealId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
//<-----------------------------------email for Deals--------------------------------------->
async function fetchEmailsForDeals(
  data1,
  sourceAccessToken,
  targetAccessToken
) {
  const results = [];

  for (const data of data1) {
    console.log("data", data);
    try {
      // Fetch engagements (tasks, emails, etc.) for each contact
      const url = `https://api.hubapi.com/engagements/v1/engagements/associated/DEAL/${data.dealId}/paged?limit=100`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${sourceAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      // Filter for EMAIL engagements (email activities)
      const emails = response.data.results.filter(
        (engagement) => engagement.engagement.type === "EMAIL"
      );

      for (const email of emails) {
        console.log("Email Engagement: ", email);
        console.log(`EmailID: ${email.engagement.id}`);
        console.log(`Subject: ${email.metadata.subject}`);
        console.log(`Status: ${email.metadata.status}`);
        console.log(`Body: ${email.engagement.bodyPreview}`);
        console.log(`Timestamp: ${email.engagement.timestamp}`);
        const EmailID = email.engagement.id;
        const Subject = email.metadata.subject;
        const Status = email.metadata.status;
        const Body = email.engagement.bodyPreview;
        const Timestamp = email.engagement.timestamp

        // Get the company ID from associations
        const dealId = email.associations.dealIds[0];
        console.log("dealId", dealId);
        // Fetch the contact's email using the contact ID
        if (!dealId) {
          console.error("No associated contact ID found for this engagement.");
          continue;
        }

        const contactUrl = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`;
        const contactResponse = await axios.get(contactUrl, {
          headers: {
            Authorization: `Bearer ${sourceAccessToken}`,
            "Content-Type": "application/json",
          },
        });
        console.log("contactResponse", contactResponse.data);

        const dealName = contactResponse.data.properties.dealname;
        console.log("dealName--------", dealName)
        // Search for the HubSpot deal by name
        const hubSpotDeal = await searchDealByDealName(
          `https://api.hubapi.com/crm/v3/objects/deals/search`,
          dealName,
          DESTINATION_ACCESS_TOKEN
        );

        if (!hubSpotDeal || !hubSpotDeal.results || hubSpotDeal.results.length === 0) {
          console.error(`No HubSpot deal found for name: ${dealName}`);
          return;
        }

        // Extract the deal ID
        const hubSpotDealId = hubSpotDeal.results[0].id;
        console.log("HubSpot Deal ID:", hubSpotDealId);
        // Handle email attachments if present
        if (email.attachments && email.attachments.length > 0) {
          console.log("email.attachments", email.attachments);
          for (const attachment of email.attachments) {
            try {
              // Step 1: Download the attachment from the source HubSpot
              const fileData = await downloadDealAttachment(
                attachment.id,
                sourceAccessToken
              );
              console.log(`Downloaded file ${attachment.id}`);

              // Step 2: Upload the attachment to the target HubSpot
              const uploadFileId = await uploadFileToDealHubSpot(fileData);
              console.log(`Uploaded file with ID ${uploadFileId}`);

              // Step 3: Create engagement with attachment in the target HubSpot
              await createEngagementWithDealAttachment(
                email,
                hubId,
                uploadFileId,
                targetAccessToken
              );
            } catch (error) {
              console.error(
                `Error syncing attachment ${attachment.id}:`,
                error.message
              );
            }
          }
        } else {
          // Sync email without attachments
          try {
            await createEngagementWithDealAttachment(
              email,
              hubSpotDealId,
              null, // No attachment
              targetAccessToken
            );
          } catch (error) {
            console.error(`Error syncing email without attachments:`, error.message);
          }
        }
      }

      console.log(`Fetched ${emails.length} emails for contact ${data.id}`);
    } catch (error) {
      console.error(
        `Error fetching emails for contact ${data.id}:`,
        error.response ? error.response.data : error.message
      );
    }
  }

  return results;
}
const downloadDealAttachment = async (attachmentId, accessToken) => {
  try {
    const url = `https://api.hubapi.com/files/v3/files/${attachmentId}`;
    // Get file details
    const fileDetailsResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("File details:", fileDetailsResponse.data);

    const extension = fileDetailsResponse.data.extension || "unknown";
    if (!extension) {
      console.error(
        `Missing file extension for ${fileDetailsResponse.data.name}`
      );
      return null;
    }

    // Step 2: Generate signed download URL
    const signedUrlResponse = await axios.get(`${url}/signed-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const downloadUrl = signedUrlResponse.data.url; // Check if this is correct
    // console.log("downloadUrl+++++++++++++++++++++++", downloadUrl);
    const fileData = await axios.get(downloadUrl, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
      responseType: "arraybuffer",
    });

    // console.log("fileData++++++++++++++++++", fileData.data);
    // const filePath = path.join(__dirname, 'downloads',`${fileDetailsResponse.data.name}.${extension}`);
    const filePath = path.join(
      __dirname,
      "downloads",
      `${fileDetailsResponse.data.name}.` +
      `${fileDetailsResponse.data.extension}`
    );
    // console.log("filePath-------------------->", filePath);
    fs.writeFileSync(filePath, fileData.data);
    console.log(`File saved successfully at: ${filePath}`);

    return filePath;
  } catch (error) {
    console.error(
      "Error downloading file:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
async function uploadFileToDealHubSpot(filePath) {
  console.log("filepath-------------->0,", filePath);
  try {
    const fileContent = fs.readFileSync(filePath);
    console.log("fileContent-----------------", fileContent);
    const fileName = path.basename(filePath);
    console.log("fileName------------------------", fileName);
    const hubspotUrl = `https://api.hubapi.com/files/v3/files`;

    const formData = new FormData();
    formData.append("file", fileContent, fileName);

    const folderPath = "/";
    formData.append("folderPath", folderPath);
    formData.append(
      "options",
      JSON.stringify({ access: "PRIVATE", folderPath })
    );

    const uploadResponse = await axios.post(hubspotUrl, formData, {
      headers: {
        Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
    });

    // fs.unlinkSync(filePath); // Ensure the file path variable is correct here
    // console.log("File uploaded to HubSpot:", hubspotResponse.data);
    console.log("uploadResponse", uploadResponse.data);
    return uploadResponse.data;
  } catch (error) {
    console.error(
      "Error uploading file to HubSpot:",
      error.response ? error.response.data : error.message
    );
  }
}
async function createEngagementWithDealAttachment(
  email,
  hubSpotContactId,
  uploadedFileId,
  accessToken
) {
  try {
    console.log("uploadedFileId:", uploadedFileId);
    console.log("email:", email);
    console.log("hubSpotContactId:", hubSpotContactId);
    console.log("accessToken:", accessToken);
    const emailBody = email.metadata.html || (email.metadata.text ? `<pre>${email.metadata.text}</pre>` : "No body content"); // Wrap plain text in <pre> for basic formatting
    const engagementData = {
      engagement: {
        active: true,
        type: "EMAIL",
        timestamp: email.engagement.createdAt, // Ensure this is a number
      },
      associations: {
        dealIds: [hubSpotContactId],
      },
      attachments: uploadedFileId
        ? [
          {
            id: typeof uploadedFileId === "object" ? uploadedFileId.id : uploadedFileId,
          },
        ]
        : [], // Only include attachments if uploadedFileId is provided
      metadata: {
        html: emailBody, // Use the formatted email body,
        // from: {
        //   email: email.FromAddress,
        // },
        subject: email.metadata.subject || "No subject content",
        // body: email.metadata.text || email.metadata.html || "No body content",
        // from: email.metadata.from || {}, // Sender's details
        to: email.metadata.to || [], // Recipients
        cc: email.metadata.cc || [], // CC recipients
        bcc: email.metadata.bcc || [], // BCC recipients
        sender: email.metadata.sender || {}, // Sender information
        text: email.metadata.text || "", // Plain text body
      },
    };

    // console.log(
    //   "Engagement data being sent:",
    //   JSON.stringify(engagementData, null, 2)
    // );

    const engagementResponse = await axios.post(
      "https://api.hubapi.com/engagements/v1/engagements",
      engagementData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      `Email synced successfully with HubSpot for contact ID ${hubSpotContactId}.`
    );
  } catch (error) {
    console.error(
      `Error syncing email for contact ID ${hubSpotContactId}:`,
      error.response ? error.response.data : error.message
    );
  }
}
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
