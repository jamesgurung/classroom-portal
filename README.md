# Classroom Portal

This app can be deployed by schools to give parents/carers live access to the homework set on Google Classroom.

Instructions are included to set everything up and self-host for free on Cloudflare. You will be able to send each parent a personalised link to view their child's homework without needing to manage any logins.

![Screenshot](/screenshot.png)

## Installation instructions

Follow the steps below to set up this app for your school.

### 1. Fork this repository

Your school's copy of this app should not run directly from the source code here. Instead, you should create your own copy of the code (called a fork). This means you will always be in full control of what you deploy.

* [Create a free GitHub account](https://github.com/signup) using your work email address, if you don't already have one.
* Optional: Create a GitHub organisation for your school, so that the app will be owned by the organisation, rather than your individual account.
* In the top-right corner of this [repository homepage](https://github.com/jamesgurung/classroom-portal), click Fork. This will create a copy of the source code for your school's use.

### 2. Create a service account to access Google Classroom

Your app will need access to all users' assignments on Google Classroom. This requires authorisation as a domain administrator.

* [Create a new project](https://console.cloud.google.com/projectcreate) on the Google Cloud Platform console.
* [Enable the Google Classroom API.](https://console.cloud.google.com/apis/library/classroom.googleapis.com) 
* [Configure the OAuth consent screen.](https://console.cloud.google.com/apis/credentials/consent) Select "Internal" and set the app name to "Classroom Portal". Provide the email addresses as required. You do not need to add any scopes on the next screen.
* [Create a new service account.](https://console.cloud.google.com/iam-admin/serviceaccounts) Give it any name, and skip both "Grant access" steps.
* Once the service account is created, click Edit > Add key > Create new key > JSON. The service account's private key will be downloaded to your computer. Save this for later.
* Now delegate domain-wide authority to this service account:
    * Still on the Edit page, tick "Enable G Suite domain-wide delegation", and save.
    * On the Service Accounts overview page, click "View Client ID" and copy the long ID number.
    * Open your Google Workspace [Admin console](https://admin.google.com/) and go to Main menu > Security > API controls.
    * In the "Domain wide delegation" pane, select "Manage Domain Wide Delegation", and then "Add new".
    * In the "Client ID" field enter the service account's Client ID which you copied earlier.
    * In the "OAuth Scopes" field enter `https://www.googleapis.com/auth/classroom.courses.readonly, https://www.googleapis.com/auth/classroom.coursework.me.readonly`
    * Click "Authorize".

### 3. Deploy the Cloudflare Worker

This serverless app will provide a secure API to retrieve homework assignments from Google Classroom.

* [Create a free Cloudflare account](https://dash.cloudflare.com/sign-up) using your work email address, if you don't already have one.
* On the [Cloudflare homepage](https://dash.cloudflare.com/), click Workers -> Create a service. When you are prompted to set up a `*.workers.dev` subdomain, set it to the name of your school (for example `yourschool`).
* Create a worker with the service name `classroomportal`. Leave the default starter template for now.
* Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) and click Create Token. Use the "Edit Cloudflare Workers" template, and set Account Resources to "All accounts" and Zone Resources to "All zones". Copy the value of the token you create.
* Open the GitHub repository you created in Step 1. Click Settings -> Secrets, and configure the following repository secret:
  * Name: `CLOUDFLARE_API_TOKEN`
  * Value: the token you just created
* Still on GitHub, go to the Actions tab and click "I understand my workflows, go ahead and enable them".
* Click Deploy Cloudflare worker -> Run workflow. This will deploy the worker app, and should show a green checkmark when complete.
* Go to `https://classroomportal.yourschool.workers.dev/generatesecrets`, where `yourschool` is the name of the subdomain you created earlier. Copy the values of the generated secrets.
* Go back to your Cloudflare Worker, and click Settings -> Variables -> Edit variables. Create the following settings, and select Encrypt for each one (if you don't select Encrypt, they will be deleted every time the app updates):
  * `ENCRYPTION_IV`, `ENCRYPTION_KEY`, and `ENCRYPTION_URL` - The values from `/generatesecrets`.
  * `GOOGLE_PRIVATE_KEY` - The value of the private key you downloaded in Step 2. Open the key file and copy the value of `private_key` (everything between "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----", exclusive). Remove all `\n` tokens.
  * `GOOGLE_SERVICE_ACCOUNT_EMAIL` - The email address of your service account. This can be found under `client_email` in the key file, and usually ends in `.iam.gserviceaccount.com`.
  * `STUDENT_EMAIL_DOMAIN` - The domain name for your student email addresses (e.g. `yourschool.org`).
  * `CLIENT_ORIGIN` - The custom domain where you will run the final version of your app (e.g. `https://homework.yourschool.org`). This is used to set the Access-Control-Allow-Origin header.
  * `COURSES_SUFFIX` - Homework tasks will only be fetched from Google Classroom courses that end in this value (e.g. `-2021`). Use `*` to accept all classes.
* Test that your worker is running correctly. Navigate to the following paths on `https://classroomportal.yourschool.workers.dev`, where `yourschool` is your subdomain:
  * `/encrypt/{ENCRYPTION_URL}/{studentUsername}` (where `ENCRYPTION_URL` is the value you saved earlier and `studentUsername` is any test student at your school) - This will encrypt the student's username, and you will use this encrypted value in the next step.
  * `/homework/{encryptedUsername}` - This should show you a list of all homework assignments for the selected student.

### 4. Deploy the Cloudflare Pages

Now that the API worker is ready, you need to set up the client app.

* On the [Cloudflare homepage](https://dash.cloudflare.com/), click Pages -> Create a project.
* Select your GitHub repository.
* Configure your client app:
  * Project name: e.g. `yourschool-homework`
  * Production branch: main
  * Framework preset: None
  * Build command: `eleventy --input=src`
  * Output build directory: `_site`
  * Root directory: `Pages`
  * Environment Variables: Name: `WORKER_URL`, Value: `https://classroomportal.yourschool.workers.dev` (where `yourschool` is the name of your subdomain)
* Click Save and Deploy.
* Wait for the deployment to finish, and then click Continue to project. 
* Click Custom domains -> Set up a custom domain.
* Type your custom domain, e.g. `homework.yourschool.org`, then select Continue -> Begin CNAME setup.
* Set up the CNAME records on your website DNS, and then click Check DNS records.
* Test that your client app is running correctly, by navigating to `https://homework.yourschool.org/#key={encryptedUsername}&student={studentForename}` (where `yourschool.org` is your custom domain, `encryptedUsername` is the token you created at the end of Step 3, and `studentForename` is the first name of the test student).

## Generate parent login links

You can send each parent a personalised link, which will give them access to all their children's homework.

* Download the [ParentLinks.xlsx](https://github.com/jamesgurung/classroom-portal/raw/main/ParentLinks.xlsx) spreadsheet template.
* Fill in the three values at the top of the sheet:
  * Cloudflare worker domain: e.g. `https://classroomportal.yourschool.workers.dev`
  * Client app domain: e.g. `https://homework.yourschool.org`
  * Encryption URL secret: the `ENCRYPTION_URL` you configured earlier
* Run a report from your MIS to include parent email address, student username (the part of their email address before the `@` symbol), and student forename. Order this report by parent email, and remove duplicates across all columns.
* Paste the data from this report into the white cells in the `ParentLinks.xlsx` sheet.
* The URL column will contain personalised links to send each parent. Copy all this data and 'Paste as values' into a fresh spreadsheet, ready for mail merge.

## Keep the app updated

When the source code for this app is updated, new changes will not automatically be applied to your fork. At the top of your forked repository, use the Fetch Upstream button to sync updates.

Once the source code is synced, your client and server apps will automatically update within a few minutes.
