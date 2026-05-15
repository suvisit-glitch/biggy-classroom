// นำ URL ของ Web App ที่ได้จาก Google Apps Script มาใส่ที่นี่
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwZDasn7a0jTWJwWmwfqG3nwByyQ25e5TpOJkdjKcjPl6Zj1MEoCVFKMUCDC3yLDs9k/exec';

const video = document.getElementById('video');
const emotionStatus = document.getElementById('emotion-status');
const canvas = document.getElementById('overlay');
let lastSavedTime = 0;

// โหลดโมเดล AI (face-api.js) จาก URL ของ GitHub
Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
  faceapi.nets.faceExpressionNet.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights')
]).then(startVideo);

// เปิดกล้อง
function startVideo() {
  // หากใช้ IMOU ผ่าน OBS จะต้องเลือก OBS Virtual Camera ในบราวเซอร์
  navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 560 } })
    .then(stream => {
      video.srcObject = stream;
      console.log("กล้องพร้อมใช้งาน");
    })
    .catch(err => {
      console.error("ไม่สามารถเข้าถึงกล้องได้: ", err);
      emotionStatus.innerText = "ไม่สามารถเชื่อมต่อกล้องได้ ⚠️";
    });
}

video.addEventListener('play', () => {
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  setInterval(async () => {
    // ประมวลผลใบหน้าและอารมณ์ในเฟรมวิดีโอ
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();
    
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    
    // วาดผลลัพธ์บนแคนวาสซ้อนทับ (กรอบสีแดงและข้อความอารมณ์)
    if (detections.length > 0) {
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceExpressions(canvas, resizedDetections);

      // หาอารมณ์ที่โดดเด่นที่สุด
      const expressions = detections[0].expressions;
      const topEmotion = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
      
      // แปลงอารมณ์เป็นภาษาไทย
      const emotionMap = {
        happy: "มีความสุข 😄", sad: "เศร้า 😢", angry: "โกรธ 😠",
        fearful: "หวาดกลัว 😨", disgusted: "รังเกียจ 🤢", surprised: "ประหลาดใจ 😲", neutral: "ปกติ 😐"
      };
      const thEmotion = emotionMap[topEmotion] || topEmotion;
      
      // คาดเดาพฤติกรรมคร่าวๆ จากตำแหน่งหน้า (สามารถพัฒนา PoseNet ได้ในอนาคต)
      let behavior = "กำลังสนใจเรียน";
      if (topEmotion === 'sad' || topEmotion === 'angry') behavior = "อาจมีความกังวล/ต้องการความช่วยเหลือ";

      emotionStatus.innerText = thEmotion;

      // บันทึกลง Google Sheet ทุกๆ 10 วินาที
      const now = new Date().getTime();
      if (now - lastSavedTime > 10000) {
        saveToSheet(thEmotion, behavior);
        lastSavedTime = now;
      }
    } else {
        emotionStatus.innerText = "ไม่พบนักเรียนในกล้อง";
    }
  }, 300); // เช็คทุกๆ 0.3 วินาที เพื่อให้ Real-time มากขึ้น
});

// ฟังก์ชันส่งข้อมูลไป Google Sheet
function saveToSheet(emotion, behavior) {
  fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors', // เลี่ยงปัญหา CORS ป้องกันฝั่งหน้าบ้านพัง
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveLog', emotion: emotion, behavior: behavior })
  }).catch(e => console.log("Save error:", e));
}

// === ระบบผู้ดูแลระบบ ===
const adminBtn = document.getElementById('admin-btn');
const adminModal = document.getElementById('admin-modal');
const closeModal = document.getElementById('close-modal');
const loginBtn = document.getElementById('login-btn');
const adminData = document.getElementById('admin-data');

adminBtn.onclick = () => adminModal.classList.remove('hidden');
closeModal.onclick = () => { adminModal.classList.add('hidden'); adminData.classList.add('hidden'); };

loginBtn.onclick = async () => {
  const pass = document.getElementById('admin-pass').value;
  loginBtn.innerText = "กำลังตรวจสอบ...";
  
  try {
    const response = await fetch(`${GAS_URL}?action=getLogs&pass=${pass}`);
    const result = await response.json();
    
    if (result.status === 'success') {
      let html = "<table><tr><th>วันที่และเวลา</th><th>อารมณ์</th><th>พฤติกรรม</th></tr>";
      // วนลูปข้อมูล (ข้ามแถวแรกที่เป็น Header)
      result.data.slice(1).forEach((row, index) => {
        html += `<tr><td>${new Date(row[0]).toLocaleString('th-TH')}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`;
      });
      html += "</table>";
      adminData.innerHTML = html;
      adminData.classList.remove('hidden');
    } else {
      alert("รหัสผ่านไม่ถูกต้อง!");
    }
  } catch (err) {
    alert("เกิดข้อผิดพลาดในการดึงข้อมูล");
  }
  loginBtn.innerText = "เข้าสู่ระบบ";
};
