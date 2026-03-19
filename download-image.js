const fs = require('fs');
const https = require('https');

const url = "https://lh3.googleusercontent.com/y35dG1i95M6g7fJ86jL3R4I8q10jBw-z12v-Q5z9fM4iK-P5_t1xH6C34uX2N8g9L8c3S_7W=s0";
const file = fs.createWriteStream("d:/project/health/public/anatomy.png");

https.get(url, function(response) {
  response.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Download Completed");
  });
}).on("error", (err) => {
  console.log("Error: ", err.message);
});
