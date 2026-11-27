const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const assert = require('assert');

async function testSoftDelete() {
  process.env.PORT = '0';
  const app = require('../server');
  const { User, Student, Resume, Application } = require('../models');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to:', mongoose.connection.name);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const studentUser = await User.findOne({ email: 's91453604@gmail.com' });
  const student = await Student.findOne({ user: studentUser._id });

  const token = jwt.sign(
    {
      id: studentUser._id.toString(),
      role: studentUser.role,
      college: (studentUser.college?._id || studentUser.college)?.toString(),
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('\n--- 1. Create a Temporary Test Resume ---');
  let createRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Temporary Soft Delete Test Resume',
      templateId: 'modern',
      isPrimary: false,
      data: { summary: 'Testing soft delete and trash functionality' }
    })
  });
  let createJson = await createRes.json();
  assert.strictEqual(createRes.status, 201);
  assert.strictEqual(createJson.success, true);
  const testResumeId = createJson.resume._id;
  console.log('Created test resume:', testResumeId);

  console.log('\n--- 2. Verify Resume Appears in Active List ---');
  let listRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let listJson = await listRes.json();
  assert(listJson.resumes.some(r => r._id === testResumeId), 'New resume must appear in active list');
  console.log('Verified resume in Active list');

  console.log('\n--- 3. Move Resume to Trash ---');
  let trashRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${testResumeId}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  let trashJson = await trashRes.json();
  assert.strictEqual(trashRes.status, 200);
  assert.strictEqual(trashJson.success, true);
  assert.strictEqual(trashJson.message, 'Resume moved to Trash');
  assert.strictEqual(trashJson.resume.deleted, true);
  console.log('Resume successfully moved to Trash');

  console.log('\n--- 4. Verify Resume Disappeared from Active List ---');
  listRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  listJson = await listRes.json();
  assert(!listJson.resumes.some(r => r._id === testResumeId), 'Deleted resume must not appear in active list');
  console.log('Verified resume absent from Active list');

  console.log('\n--- 5. Verify Resume Disappeared from Archived List ---');
  let archListRes = await fetch(`${baseUrl}/api/resume-studio/resumes?archived=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let archListJson = await archListRes.json();
  assert(!archListJson.resumes.some(r => r._id === testResumeId), 'Deleted resume must not appear in archived list');
  console.log('Verified resume absent from Archived list');

  console.log('\n--- 6. Verify Resume Appears in Trash List ---');
  let trashListRes = await fetch(`${baseUrl}/api/resume-studio/resumes/trash`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let trashListJson = await trashListRes.json();
  assert.strictEqual(trashListRes.status, 200);
  assert.strictEqual(trashListJson.success, true);
  assert(trashListJson.resumes.some(r => r._id === testResumeId), 'Deleted resume must appear in trash list');
  console.log('Verified resume present in Trash list. Count:', trashListJson.resumes.length);

  console.log('\n--- 7. Prevent Deleted Resume from Becoming Primary ---');
  let primaryRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${testResumeId}/primary`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  let primaryJson = await primaryRes.json();
  assert.strictEqual(primaryRes.status, 400);
  assert.strictEqual(primaryJson.success, false);
  assert(primaryJson.message.includes('deleted'), 'Must reject setting deleted resume as primary');
  console.log('Correctly rejected setting deleted resume as primary:', primaryJson.message);

  console.log('\n--- 8. Restore Resume from Trash ---');
  let restoreRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${testResumeId}/restore-trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  let restoreJson = await restoreRes.json();
  assert.strictEqual(restoreRes.status, 200);
  assert.strictEqual(restoreJson.success, true);
  assert.strictEqual(restoreJson.message, 'Resume restored from Trash');
  assert.strictEqual(restoreJson.resume.deleted, false);
  console.log('Resume successfully restored from Trash');

  console.log('\n--- 9. Verify Resume is Back in Active List ---');
  listRes = await fetch(`${baseUrl}/api/resume-studio/resumes`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  listJson = await listRes.json();
  assert(listJson.resumes.some(r => r._id === testResumeId), 'Restored resume must reappear in active list');
  console.log('Verified resume reappeared in Active list');

  console.log('\n--- 10. Test Archive and Unarchive Flow ---');
  let archiveRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${testResumeId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  let archiveJson = await archiveRes.json();
  assert.strictEqual(archiveRes.status, 200);
  assert.strictEqual(archiveJson.message, 'Resume archived successfully');

  // Verify in archived list
  archListRes = await fetch(`${baseUrl}/api/resume-studio/resumes?archived=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  archListJson = await archListRes.json();
  assert(archListJson.resumes.some(r => r._id === testResumeId), 'Archived resume must appear in archived list');

  // Unarchive using new endpoint
  let unarchiveRes = await fetch(`${baseUrl}/api/resume-studio/resumes/${testResumeId}/unarchive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  let unarchiveJson = await unarchiveRes.json();
  assert.strictEqual(unarchiveRes.status, 200);
  assert.strictEqual(unarchiveJson.message, 'Resume unarchived successfully');
  assert.strictEqual(unarchiveJson.resume.archived, false);
  console.log('Verified archive and unarchive flows');

  console.log('\n--- 11. Cleanup Test Resume (Remove test document) ---');
  await Resume.deleteOne({ _id: testResumeId });
  console.log('Cleaned up test resume');

  server.close();
  await mongoose.disconnect();
  console.log('\nALL 11 BACKEND SOFT DELETE & TRASH ASSERTIONS PASSED!');
  process.exit(0);
}

testSoftDelete().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
