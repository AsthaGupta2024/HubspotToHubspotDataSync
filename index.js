require("dotenv").config();
const axios = require("axios");
const express = require("express");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(express.json());

const BASE_URI = process.env.BASE_URI;
const SOURCE_ACCESS_TOKEN = process.env.SOURCE_ACCESS_TOKEN;
const DESTINATION_ACCESS_TOKEN = process.env.DESTINATION_ACCESS_TOKEN;
const PORT=process.env.PORT;

//<----------Entry point--------->
app.post("/webhook", async (req, res) => {
  // console.log("body",req.body);
  res.status(200).send("Event received");
  // Fetch the list of contacts
  const response = await axios.get(`${BASE_URI}/crm/v3/objects/contacts`, {
    headers: {
      Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  // Get the first contact from the response data
  const data1 = response.data.results;
  // console.log("Fetched contact data:----------------", data1)
  for (const data of data1) {
    try {
      // Step 1: Search for existing contact by email
      const email = data.properties.email;
      // Fetch the HubSpot contact ID using the Salesforce contact email
      const contactResponse = await axios.post(
        `${BASE_URI}/crm/v3/objects/contacts/search`,
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
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      const results = contactResponse.data.results;
      // console.log("results", results);

      const existingContactId =
        results && results.length > 0 ? results[0].id : null;
      // console.log("existingContactId");
      if (existingContactId) {
        // Step 2: Update the contact if it already exists
        await axios.patch(
          `${BASE_URI}/crm/v3/objects/contacts/${existingContactId}`,
          {
            properties: {
              firstname: data.properties.firstName,
              lastname: data.properties.lastName,
              email: data.properties.email,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`Contact ${data.properties.email} updated successfully.`);
      } else {
        // Step 3: Create a new contact if none exists
        await axios.post(
          `${BASE_URI}/crm/v3/objects/contacts`,
          {
            properties: {
              firstname: data.properties.firstName,
              lastname: data.properties.lastName,
              email: data.properties.email,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`Contact ${data.properties.email} created successfully.`);
      }
    } catch (error) {
      throw error;
    }
  }

  const syncNotes = await processNotesForContacts(data1, SOURCE_ACCESS_TOKEN);
  const syncTasks = await processTaskForContacts(data1, SOURCE_ACCESS_TOKEN);
  const syncMeetings = await processMeetingForContacts(data1, SOURCE_ACCESS_TOKEN);
  const syncCalls = await processCallForContacts(data1, SOURCE_ACCESS_TOKEN);
  const fetchEmail1 = fetchEmailsForContacts(data1, SOURCE_ACCESS_TOKEN, DESTINATION_ACCESS_TOKEN);
});
async function getHubSpotContactIdByEmail(email, accessToken) {
  const url = `${BASE_URI}/crm/v3/objects/contacts/search`;
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
async function processNotesForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    const email = data.properties.email;
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const notes = await fetchNotesFromHubSpot(data.id, SOURCE_ACCESS_TOKEN);
    // console.log(`Notes for Contact ${data.id}:`, notes);
    await syncNotesWithHubSpot(email, notes, DESTINATION_ACCESS_TOKEN);
  }
}
//Function to fetch all notes from salesforce
async function fetchNotesFromHubSpot(contactId, hubspotAccessToken) {
  // console.log("contactId", contactId);
  try {
    const url = `${BASE_URI}/crm/v3/objects/notes?associations=contacts&limit=100&properties=hs_note_body`;

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

    // console.log(`Fetched ${notes.length} notes for contact ${contactId}`);
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
async function syncNotesWithHubSpot(email, notes, DESTINATION_ACCESS_TOKEN) {
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const note of notes) {
    try {
      const response = await axios.post(
        `${BASE_URI}/crm/v3/objects/notes`,
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
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      // console.log(
      //   // `Note for Contact ${hubSpotContactId} synced successfully:`,
      //   response.data
      // );
    } catch (error) {
      console.error(
        `Error syncing note for Contact ${hubSpotContactId}:`,
        error.response ? error.response.data : error.message
      );
    }
  }
}
// Function to process tasks for contacts
async function processTaskForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const tasks = await fetchTasksFromHubSpot(data.id, SOURCE_ACCESS_TOKEN);
    // console.log(`Tasks for Contact ${data.id}:`, tasks);

    // Sync only the current task with HubSpot or perform further processing
    await syncTasksWithHubSpot(email, tasks, DESTINATION_ACCESS_TOKEN);
  }
}
// Function to fetch tasks
async function fetchTasksFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  // console.log("dataId", dataId);
  try {
    const url = `${BASE_URI}/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for TASK engagements only
    const tasks = response.data.results.filter(
      (task) => task.engagement.type === "TASK"
    );

    // console.log(`Fetched ${tasks.length} tasks for contact ${dataId}`);
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
async function syncTasksWithHubSpot(email, tasks, DESTINATION_ACCESS_TOKEN) {
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const task of tasks) {
    console.log("task--------->",task);
    try {
      const response = await axios.post(
        `${BASE_URI}/engagements/v1/engagements`,
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
            priority:task.metadata.priority,

          },
        },
        {
          headers: {
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      // console.log(
      //   `Task for Contact ${hubSpotContactId} synced successfully:`,
      //   response.data
      // );
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
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const meetings = await fetchMeetingsFromHubSpot(
      data.id,
      SOURCE_ACCESS_TOKEN
    );
    // console.log(`Meetings for Contact ${data.id}:`, meetings);

    // Sync only the current task with HubSpot or perform further processing
    await syncMeetingsWithHubSpot(email, meetings, DESTINATION_ACCESS_TOKEN);
  }
}
// Function to fetch meetings
async function fetchMeetingsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  // console.log("Fetching meetings for contact ID:", dataId);
  try {
    const url = `${BASE_URI}/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for MEETING engagements only
    const meetings = response.data.results.filter(
      (meeting) => meeting.engagement.type === "MEETING"
    );

    // console.log(`Fetched ${meetings.length} meetings for contact ${dataId}`);
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
async function syncMeetingsWithHubSpot(email, meetings, DESTINATION_ACCESS_TOKEN) {
  const hubSpotContactId = await getHubSpotContactIdByEmail(
    email,
    DESTINATION_ACCESS_TOKEN
  );
  // console.log("hubSpotContactId", hubSpotContactId);
  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const meeting of meetings) {
    try {
      const response = await axios.post(
        `${BASE_URI}/engagements/v1/engagements`,
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
            Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
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
async function processCallForContacts(data1, SOURCE_ACCESS_TOKEN) {
  for (const data of data1) {
    const email = data.properties.email;
    // console.log("email-------->", email);
    if (!email) {
      console.error("Email is missing for contact:", data.id);
      continue;
    }

    const calls = await fetchCallsFromHubSpot(data.id, SOURCE_ACCESS_TOKEN);
    // console.log(`Calls for Contact ${data.id}:`, calls);
    // Sync only the current call with the other HubSpot instance or perform further processing
    await syncCallsWithHubSpot(email, calls, DESTINATION_ACCESS_TOKEN);
  }
}
// Function to fetch calls
async function fetchCallsFromHubSpot(dataId, SOURCE_ACCESS_TOKEN) {
  try {
    const url = `${BASE_URI}/engagements/v1/engagements/associated/CONTACT/${dataId}/paged?limit=100`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // Filter for CALL engagements only
    const calls = response.data.results.filter(
      (call) => call.engagement.type === "CALL"
    );

    // console.log(`Fetched ${calls.length} calls for contact ${dataId}`);
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
async function syncCallsWithHubSpot(email, calls, DESTINATION_ACCESS_TOKEN) {
  const hubSpotContactId = await getHubSpotContactIdByEmail(email, DESTINATION_ACCESS_TOKEN);

  if (!hubSpotContactId) {
    console.error(`No HubSpot contact found for email: ${email}`);
    return;
  }

  for (const call of calls) {
    console.log("call----------",call);
    try {
      const response = await axios.post(
        `${BASE_URI}/engagements/v1/engagements`,
        {
          properties: {
            // hs_call_body: call.properties.hs_call_body || "No call content",
            hs_timestamp: call.engagement.timestamp,
            hs_call_recording_url: "https://dl.prokerala.com/downloads/ringtones/files/mp3/karimala-mugalil-digital-58501-64451.mp3",
          },
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
            title:call.metadata.title,
            direction:call.metadata.direction,
            recordingUrl:"https://dl.prokerala.com/downloads/ringtones/files/mp3/karimala-mugalil-digital-58501-64451.mp3",  // Include the URL here
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

async function fetchEmailsForContacts(
  data1,
  SOURCE_ACCESS_TOKEN,
  DESTINATION_ACCESS_TOKEN
) {
  const results = [];

  for (const data of data1) {
    // console.log("data", data);
    // console.log("hubSpotContactId", hubSpotContactId);
    try {
      // Fetch emails (engagements of type EMAIL) for each contact
      const url = `${BASE_URI}/engagements/v1/engagements/associated/CONTACT/${data.id}/paged?limit=100`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
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

        const contactUrl = `${BASE_URI}/crm/v3/objects/contacts/${contactId}`;
        const contactResponse = await axios.get(contactUrl, {
          headers: {
            Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        });

        const contactEmail = contactResponse.data.properties.email;
        if (!contactEmail) {
          console.error("No email address found for contact", contactId);
          continue;
        }

        // console.log("Contact email:", contactEmail);
        const hubSpotContactId = await getHubSpotContactIdByEmail(
          contactEmail,
          DESTINATION_ACCESS_TOKEN
        );
        // Further processing as needed
        if (email.attachments && email.attachments.length > 0) {
          for (const attachment of email.attachments) {
            // console.log("attachment", attachment);
            try {
              // Step 1: Download the attachment from the source HubSpot
              const fileData = await downloadAttachment(
                attachment.id,
                SOURCE_ACCESS_TOKEN
              );
              // console.log("fileData----------------->", fileData);
              // console.log(`Downloaded file ${attachment.id}`);

              // Step 2: Upload the attachment to the target HubSpot
              const uploadFileId = await uploadFileToHubSpot(fileData, DESTINATION_ACCESS_TOKEN);
              // console.log(`Uploaded file with ID ${uploadFileId}`);

              //Step 3: engagement with specifi contact
               createEngagementWithAttachment(
                email,
                hubSpotContactId,
                uploadFileId,
                DESTINATION_ACCESS_TOKEN
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
      // console.log(`Fetched ${emails.length} emails for contact ${data.id}`);
    } catch (error) {
      console.error(
        `Error fetching emails for contact ${data.id}:`,
        error.response ? error.response.data : error.message
      );
    }
  }

  return results;
}
const downloadAttachment = async (attachmentId, SOURCE_ACCESS_TOKEN) => {
  try {
    const url = `${BASE_URI}/files/v3/files/${attachmentId}`;
    // Get file details
    const fileDetailsResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}` },
    });
    // console.log("File details:", fileDetailsResponse.data);
    const extension = fileDetailsResponse.data.extension || "unknown";
    if (!extension) {
      console.error(
        `Missing file extension for ${fileDetailsResponse.data.name}`
      );
      return null;
    }

    // Step 2: Generate signed download URL
    const signedUrlResponse = await axios.get(`${url}/signed-url`, {
      headers: { Authorization: `Bearer ${SOURCE_ACCESS_TOKEN}` },
    });
    const downloadUrl = signedUrlResponse.data.url; // Check if this is correct
    const fileData = await axios.get(downloadUrl, {
      headers: {
        Authorization: "Bearer " + SOURCE_ACCESS_TOKEN,
      },
      responseType: "arraybuffer",
    });
    const filePath = path.join( __dirname,"downloads",`${fileDetailsResponse.data.name}.` +`${fileDetailsResponse.data.extension}`);
    fs.writeFileSync(filePath, fileData.data);
    // console.log(`File saved successfully at: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(
      "Error downloading file:",
      error.response ? error.response.data : error.message
    );
    return null;
  }
};
async function uploadFileToHubSpot(filePath, DESTINATION_ACCESS_TOKEN) {
  // console.log("filepath-------------->0,", filePath);
  try {
    const fileContent = fs.readFileSync(filePath);
    // console.log("fileContent-----------------", fileContent);
    const fileName = path.basename(filePath);
    // console.log("fileName------------------------", fileName);
    const hubspotUrl = `${BASE_URI}/files/v3/files`;
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
    // console.log("uploadResponse", uploadResponse.data);
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
  DESTINATION_ACCESS_TOKEN
) {
  try {
    // console.log("uploadedFileId", uploadedFileId.id || uploadedFileId);
    // console.log("email-----------------------", email.data);
    // console.log("hubSpotContactId", hubSpotContactId);
    // console.log("accessToken", DESTINATION_ACCESS_TOKEN);

    const engagementData = {
      engagement: {
        active: true,
        type: "EMAIL",
        timestamp: Date.now(), 
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

    // console.log(
    //   "Engagement data being sent:",
    //   JSON.stringify(engagementData, null, 2)
    // );

    const engagementResponse = await axios.post(
      `${BASE_URI}/engagements/v1/engagements`,
      engagementData,
      {
        headers: {
          Authorization: `Bearer ${DESTINATION_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log(
    //   `Email synced successfully with HubSpot for contact ID ${hubSpotContactId}.`,
    //   engagementResponse.data
    // );
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
