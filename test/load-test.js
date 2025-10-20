const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_ENDPOINT = 'http://localhost:3001/render';
const CONCURRENT_REQUESTS = 100;
const PAYLOAD_PATH = path.join(__dirname, '../src/examples/data1.json');

async function runLoadTest() {
  console.log(`🚀 Starting load test with ${CONCURRENT_REQUESTS} concurrent requests...`);

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to read payload file at ${PAYLOAD_PATH}`);
    console.error(error);
    return;
  }

  const requests = [];
  const startTime = Date.now();

  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    requests.push(
      axios.post(API_ENDPOINT, payload, {
        responseType: 'arraybuffer', // Expecting binary data
      }).then(response => ({
        status: 'success',
        statusCode: response.status,
        size: response.data.length,
      })).catch(error => ({
        status: 'error',
        statusCode: error.response ? error.response.status : null,
        message: error.message,
      }))
    );
  }

  const results = await Promise.all(requests);
  const endTime = Date.now();

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const totalTime = (endTime - startTime) / 1000;

  console.log('\n✅ Load Test Finished!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total Time:     ${totalTime.toFixed(2)} seconds`);
  console.log(`Avg. QPS:       ${(CONCURRENT_REQUESTS / totalTime).toFixed(2)}`);
  console.log(`🟢 Successes:    ${successCount}`);
  console.log(`🔴 Errors:       ${errorCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (errorCount > 0) {
    console.log('Example errors:');
    results.filter(r => r.status === 'error').slice(0, 5).forEach(err => console.log(err));
  }
}

runLoadTest();
