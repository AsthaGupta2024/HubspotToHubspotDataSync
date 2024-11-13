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

// Read contacts from CSV file and save them to DB
fs.readFile("/home/astha-2757/Downloads/csvjson.json", "utf8", async (err, data) => {
  if (err) throw err;

  const contacts = JSON.parse(data).slice(0, 10);

  for (const contact of contacts) {
    const newContact = new Contact({
      contactId: contact["Record ID - Contact"],
      firstName: contact["First Name"],
      lastName: contact["Last Name"],
      email: contact["Email"],
      phoneNumber: contact["Phone Number"],
      contactOwner: contact["Contact owner"],
    });

    await newContact.save().catch(err => console.log(`Error saving contact ${contact["Email"]}: ${err.message}`));
  }
  console.log("Contacts saved successfully!");
});
// Function to fetch HubSpot owners and match with `contactOwner`
async function getOwnerIdByName(contactOwnerName,DESTINATION_ACCESS_TOKEN) {
  

  try {
  // console.log("hiiiiiiiiiiii");
  // console.log("DESTINATION_ACCESS_TOKEN",DESTINATION_ACCESS_TOKEN);
  // console.log("contactOwnerName",contactOwnerName);
  
  const response = await axios.get(`https://api.hubapi.com/crm/v3/owners`, {
      headers: {
        Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const owners = response.data.results;
    // console.log("owners",owners);
    const owner = owners.find(
      (o) => `${o.firstName} ${o.lastName}`.toLowerCase() === 'astha gupta'.toLowerCase()
    );
    
    // console.log("ownersssssssssss",owner);

    return owner ? owner.id : null;
  } catch (error) {
    console.log(`Error fetching owners: ${error.message}`);
    return null;
  }
}
app.get("/contacts", async (req, res) => {
  
  try {
    const { page = 1, limit = 10 } = req.query;
    const contactsFromDB = await Contact.find().skip((page - 1) * limit).limit(limit);
    for (const contact of contactsFromDB) {
      // console.log("Processing contact:", contact);
      const email = contact.email;
      const  contactId = contact.contactId;
      try {
        // Fetch owner ID based on contactOwner name
        const ownerId = await getOwnerIdByName(contact.contactOwner,DESTINATION_ACCESS_TOKEN);
        
        // Build the contact data
        const contactData = {
          properties: {
            firstname: contact.firstName,
            lastname: contact.lastName,
            email: contact.email,
            ...(ownerId && { hubspot_owner_id: ownerId }),
          },
        };

        // Search for existing contact by email
        const contactResponse = await axios.post(
          `${BASE_URI}/crm/v3/objects/contacts/search`,
          {
            filterGroups: [
              {
                filters: [
                  { propertyName: "email", operator: "EQ", value: email },
                ],
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );

        const results = contactResponse.data.results;
        const existingContactId = results && results.length > 0 ? results[0].id : null;

        // Update or create contact
        if (existingContactId) {
          await axios.patch(
            `${BASE_URI}/crm/v3/objects/contacts/${existingContactId}`,
            contactData,
            {
              headers: {
                Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log(`Contact ${contact.email} updated successfully.`);
        } else {
          await axios.post(
            `${BASE_URI}/crm/v3/objects/contacts`,
            contactData,
            {
              headers: {
                Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log(`Contact ${contact.email} created successfully.`);
        }
        // console.log("contactsFromDB",contactsFromDB);
        
      } catch (error) {
        console.log(`Error processing contact ${contact.email}: ${error.message}`);
      }

      const syncNotes = await processNotesForContacts(data1, srcaccessToken);
      const syncTasks = await processTaskForContacts(data1, srcaccessToken);
      const syncMeetings= await processMeetingForContacts(data1, srcaccessToken);
      const syncCalls= await processCallForContacts(data1, srcaccessToken);
    
      const fetchEmail1 = fetchEmailsForContacts(
        data1,
        srcaccessToken,
        desaccessToken
      );
    }

    res.status(200).json({ message: "Contacts processed successfully!" });
  } catch (error) {
    console.log("Error fetching contacts:", error.message);
    res.status(500).json({ message: "Error fetching contacts" });
  }
});
async function processNotesForContacts(data1, access_token) {
  for (const data of data1) {
    const email = data.properties.email;
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const notes = await fetchNotesFromHubSpot(data.id, access_token);
    console.log(`Notes for Contact ${data.id}:`, notes);
    // // Sync only the current note with HubSpot
    await syncNotesWithHubSpot(email, notes);
  }
}

//Function to fetch all notes from salesforce
async function fetchNotesFromHubSpot(contactId, hubspotAccessToken) {
    // console.log("contactId", contactId);
    try {
      const url = `https://api.hubapi.com/crm/v3/objects/notes?associations=contacts&limit=100&properties=hs_note_body`;
  
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${hubspotAccessToken}`,
          "Content-Type": "application/json",
        },
      });
      // console.log("notes response", response.data);
      // Filter notes associated with the specific contact
      const notes = response.data.results.filter((note) =>
        note.associations.contacts.results.some((assoc) => assoc.id === contactId)
      );
  
      console.log(`Fetched ${notes.length} notes for contact ${contactId}`);
      return notes;
    } catch (error) {
      console.error(
        `Error fetching notes for HubSpot contact ${contactId}:`,
        error.response ? error.response.data : error.message
      );
      return [];
    }
  }
  // Function to sync notes with HubSpot, ensuring contact ID is verified
  async function syncNotesWithHubSpot(email, notes) {
    const hubspotAccessToken = "pat-na1-589bbbf5-1da4-4196-af18-a12e5a95f9ec";
    const hubSpotContactId = await getHubSpotContactIdByEmail(
      email,
      hubspotAccessToken
    );
    // console.log("hubSpotContactId", hubSpotContactId);
    if (!hubSpotContactId) {
      console.error(`No HubSpot contact found for email: ${email}`);
      return;
    }
  
    for (const note of notes) {
      try {
        const response = await axios.post(
          "https://api.hubapi.com/crm/v3/objects/notes",
          {
            properties: {
              hs_note_body: note.properties.hs_note_body,
              hs_timestamp: new Date(note.createdAt).getTime(),
            },
            associations: [
              {
                to: { id: hubSpotContactId },
                types: [
                  {
                    associationCategory: "HUBSPOT_DEFINED",
                    associationTypeId: 202,
                  },
                ],
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${hubspotAccessToken}`,
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
async function processTaskForContacts(data1, access_token) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    // console.log("dataId----------------------------------", data.id);
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const tasks = await fetchTasksFromHubSpot(data.id, access_token);
    // console.log(`Tasks for Contact ${data.id}:`, tasks);

    // Sync only the current task with HubSpot or perform further processing
    await syncTasksWithHubSpot(email, tasks);
  }
}

// Function to fetch tasks
async function fetchTasksFromHubSpot(dataId, srcaccessToken) {
  // console.log("dataId", dataId);
  try {
    const url = `https://api.hubapi.com/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${srcaccessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for TASK engagements only
    const tasks = response.data.results.filter(
      (task) => task.engagement.type === "TASK"
    );

    console.log(`Fetched ${tasks.length} tasks for contact ${dataId}`);
    return tasks;
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
  const hubspotAccessToken = "pat-na1-589bbbf5-1da4-4196-af18-a12e5a95f9ec";
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    hubspotAccessToken
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const task of tasks) {
    try {
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "TASK",
            timestamp: task.engagement.timestamp,
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            subject: task.metadata.subject || "No subject",
            body: task.metadata.body || "No body content",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotAccessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Task for Contact ${hubSpotContactId} synced successfully:`,
        response.data
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
async function processMeetingForContacts(data1, access_token) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    // console.log("dataId----------------------------------", data.id);
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const meetings = await fetchMeetingsFromHubSpot(data.id, access_token);
    console.log(`Meetings for Contact ${data.id}:`, meetings);

    // Sync only the current task with HubSpot or perform further processing
    await syncMeetingsWithHubSpot(email, meetings);
  }
}

// Function to fetch meetings
async function fetchMeetingsFromHubSpot(dataId, srcAccessToken) {
  // console.log("Fetching meetings for contact ID:", dataId);
  try {
    const url = `https://api.hubapi.com/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${srcAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for MEETING engagements only
    const meetings = response.data.results.filter(
      (meeting) => meeting.engagement.type === "MEETING"
    );

    console.log(`Fetched ${meetings.length} meetings for contact ${dataId}`);
    return meetings;
  } catch (error) {
    console.error(
      `Error fetching meetings for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}

// Function to sync meetins with HubSpot
async function syncMeetingsWithHubSpot(email, meetings) {
  const hubspotAccessToken = "pat-na1-589bbbf5-1da4-4196-af18-a12e5a95f9ec";
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    hubspotAccessToken
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const meeting of meetings) {
    try {
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "MEETING",
            timestamp: meeting.engagement.timestamp,
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            subject: meeting.metadata.subject || "No subject",
            body: meeting.metadata.body || "No body content",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotAccessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Task for Contact ${hubSpotContactId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing task for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

// Function to process calls for contacts
async function processCallForContacts(data1, access_token) {
  for (const data of data1) {
    // console.log("data------------------------>", data);
    // console.log("dataId----------------------------------", data.id);
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const calls = await fetchCallsFromHubSpot(data.id, access_token);
    console.log(`Calls for Contact ${data.id}:`, calls);

    // Sync only the current call with the other HubSpot instance or perform further processing
    await syncCallsWithHubSpot(email, calls);
  }
}

// Function to fetch calls
async function fetchCallsFromHubSpot(dataId, srcAccessToken) {
  // console.log("Fetching calls for contact ID:", dataId);
  try {
    const url = `https://api.hubapi.com/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${srcAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for CALL engagements only
    const calls = response.data.results.filter(
      (call) => call.engagement.type === "CALL"
    );

    console.log(`Fetched ${calls.length} calls for contact ${dataId}`);
    return calls;
  } catch (error) {
    console.error(
      `Error fetching calls for HubSpot contact ${dataId}:`,
      error.response ? error.response.data : error.message
    );
    return [];
  }
}

// Function to sync calls with another HubSpot instance
async function syncCallsWithHubSpot(email, calls) {
  const hubspotAccessToken = "pat-na1-589bbbf5-1da4-4196-af18-a12e5a95f9ec";
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    hubspotAccessToken
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const call of calls) {
    try {
      const response = await axios.post(
        "https://api.hubapi.com/engagements/v1/engagements",
        {
          engagement: {
            active: true,
            type: "CALL",
            timestamp: call.engagement.timestamp,
          },
          associations: {
            contactIds: [hubSpotContactId],
          },
          metadata: {
            body: call.metadata.body || "No call notes available",
            status: call.metadata.status || "COMPLETED",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotAccessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(
        `Call for Contact ${hubSpotContactId} synced successfully:`,
        response.data
      );
    } catch (error) {
      console.error(
        `Error syncing call for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}

// Helper function to get HubSpot contact ID by email
async function getHubSpotContactIdByEmail(email, hubspotAccessToken) {
  try {
    const url = `https://api.hubapi.com/contacts/v1/contact/email/${email}/profile`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${hubspotAccessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data.vid; // HubSpot Contact ID
  } catch (error) {
    console.error(
      `Error fetching HubSpot contact by email (${email}):`,
      error.response ? error.response.data : error.message
    );
    return null;
  }
}

async function fetchEmailsForContacts(
  data1,
  sourceAccessToken,
  targetAccessToken
) {
  const results = [];

  for (const data of data1) {
    // console.log("data", data);
    // console.log("hubSpotContactId", hubSpotContactId);
    try {
      // Fetch emails (engagements of type EMAIL) for each contact
      const url = `https://api.hubapi.com/engagements/v1/engagements/associated/CONTACT/${data.id}/paged?limit=100`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${sourceAccessToken}`,
          "Content-Type": "application/json",
        },
      });
      // console.log("responsedataofmail", response.data);
      // Filter for EMAIL engagements
      const emails = response.data.results.filter(
        (engagement) => engagement.engagement.type === "EMAIL"
      );

      for (const email of emails) {
        // console.log("emails", email);

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
          console.error("No email address found for contact", contactId);
          continue;
        }

        console.log("Contact email:", contactEmail);

        // Search for the contact in the target HubSpot by email
        let getResponse = await searchContactByEmail(
          "https://api.hubapi.com/crm/v3/objects/contacts/search",
          contactEmail,
          targetAccessToken
        );

        if (getResponse.results.length === 0) {
          throw new Error(
            `HubSpot Contact Not Found for email: ${contactEmail}`
          );
        }

        let hubSpotContactId = getResponse.results[0].id;
        console.log(
          `HubSpot Contact ID for ${contactEmail}:`,
          hubSpotContactId
        );

        // Further processing as needed
        if (email.attachments && email.attachments.length > 0) {
          for (const attachment of email.attachments) {
            // console.log("attachment", attachment);

            try {
              // Step 1: Download the attachment from the source HubSpot
              const fileData = await downloadAttachment(
                attachment.id,
                sourceAccessToken
              );
              // console.log("fileData----------------->", fileData);
              // console.log(`Downloaded file ${attachment.id}`);

              // // Step 2: Upload the attachment to the target HubSpot
              const uploadFileId = await uploadFileToHubSpot(fileData);
              console.log(`Uploaded file with ID ${uploadFileId}`);

              //Step 3: engagement with specifi contact
              const engContact = createEngagementWithAttachment(
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
          console.log("No attachments found for this email.");
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
  // const url = `https://api.hubapi.com/filemanager/api/v3/files/${attachmentId}`;

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
  const accessToken = "pat-na1-589bbbf5-1da4-4196-af18-a12e5a95f9ec";
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
        Authorization: `Bearer ${accessToken}`,
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
    console.log("uploadedFileId", uploadedFileId.id || uploadedFileId);
    console.log("email-----------------------", email.data);
    console.log("hubSpotContactId", hubSpotContactId);
    console.log("accessToken", accessToken);

    const engagementData = {
      engagement: {
        active: true,
        type: "EMAIL",
        timestamp: Date.now(), // Ensure this is a number
      },
      associations: {
        contactIds: [hubSpotContactId],
      },
      attachments: [
        {
          id:
            typeof uploadedFileId === "object"
              ? uploadedFileId.id
              : uploadedFileId,
        },
      ],
      metadata: {
        subject: email.subject || "No subject content",
        body: email.TextBody || "No body content",
      },
    };

    console.log(
      "Engagement data being sent:",
      JSON.stringify(engagementData, null, 2)
    );

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
      `Email synced successfully with HubSpot for contact ID ${hubSpotContactId}.`,
      engagementResponse.data
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
