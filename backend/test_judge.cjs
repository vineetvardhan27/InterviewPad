const http = require('http'); 
const data = JSON.stringify({sourceCode: '#include <iostream>\nusing namespace std;\nint main() { cout << "Hello World!"; return 0; }', language: 'cpp'});
const req = http.request({hostname: 'localhost', port: 4000, path: '/api/code/run', method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)}}, res => { 
  let body = ''; 
  res.on('data', chunk => body += chunk); 
  res.on('end', () => console.log(body)); 
}); 
req.write(data); 
req.end();
