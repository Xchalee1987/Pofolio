function openManu(){
    document.getElementById('buy_menu').style.right='0%';

    // scroll to top
    document.body.scrollTop = 0; // For Safari
    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
}
function closeAllManu(){
    document.getElementById('buy_menu').style.right='100%';
    document.getElementById('buy_menu_top_7500_AL').style.right='100%';
    document.getElementById('buy_menu_top_7500_AR').style.right='100%';
    document.getElementById('buy_menu_top_5500_B').style.right='100%';
    document.getElementById('buy_menu_top_4500_C').style.right='100%';
}

function closeSelectedZoneManu() {
    document.getElementById('buy_menu_top_7500_AL').style.right='100%';
    document.getElementById('buy_menu_top_7500_AR').style.right='100%';
    document.getElementById('buy_menu_top_5500_B').style.right='100%';
    document.getElementById('buy_menu_top_4500_C').style.right='100%';
}

function openManu_top(){
    document.getElementById('buy_menu_top').style.right='0%';
}
function openManu_top_7500_AL(){
    document.getElementById('buy_menu_top_7500_AL').style.right='0%';
}
function openManu_top_7500_AR(){
    document.getElementById('buy_menu_top_7500_AR').style.right='0%';
}
function openManu_top_5500_B(){
    document.getElementById('buy_menu_top_5500_B').style.right='0%';
}
function openManu_top_4500_C(){
    document.getElementById('buy_menu_top_4500_C').style.right='0%';
}

const ticketCanvas = document.getElementById('ticketHighlightCanvas');
const ticketCtx = ticketCanvas ? ticketCanvas.getContext('2d') : null;

// ถ้า Canvas ไม่พบ ก็หยุดการทำงาน
if (!ticketCtx) {
    console.error("Canvas 'ticketHighlightCanvas' not found or context failed.");
}

/**
* ฟังก์ชันวาดรูปร่างไฮไลต์บน Canvas ของ Ticket
* @param {HTMLElement} areaElement - แท็ก <area> ที่ถูกชี้เมาส์
*/
function highlightTicketArea(areaElement) {
    if (!ticketCtx) return;

    clearTicketHighlight(); 

    const coordsString = areaElement.getAttribute('coords');
    const coords = coordsString.split(',').map(c => parseFloat(c.trim())); 
        
    // **********************************************
    // ส่วนสำคัญ: การปรับสัดส่วน (Scaling)
    // เนื่องจากรูปภาพและ Canvas ถูกตั้งค่าให้ปรับขนาด 100% 
    // แต่พิกัด (coords) อ้างอิงขนาดดั้งเดิม (เช่น 886x530)
    // เราต้องคำนวณอัตราส่วนการปรับขนาด (Scale Factor)
    // เพื่อให้พิกัดตรงกับขนาดจริงของ Canvas ที่แสดงผล
    // **********************************************
        
    // สมมติขนาดดั้งเดิมของรูปภาพ (ตามพิกัดสูงสุดที่คุณให้มา)
    const originalWidth = 960; 
    const originalHeight = 540; 
        
    // คำนวณอัตราส่วนการปรับขนาด
    const scaleX = ticketCanvas.width / originalWidth;
    const scaleY = ticketCanvas.height / originalHeight;
        
    ticketCtx.beginPath();

    // รูปแบบ rect
    if (areaElement.shape.toLowerCase() === 'rect' && coords.length === 4) {
        // ใช้พิกัดที่ปรับสเกลแล้ว
        const [x1, y1, x2, y2] = coords;
        const w = (x2 - x1) * scaleX;
        const h = (y2 - y1) * scaleY;
        ticketCtx.rect(x1 * scaleX, y1 * scaleY, w, h);
    }
    // เพิ่ม logic สำหรับ poly, circle ตรงนี้ถ้ามี

    // กำหนดสีและวาด
    ticketCtx.fillStyle = 'rgba(255, 0, 0, 0.4)'; // สีแดงโปร่งแสง 40%
    ticketCtx.fill();
}

/**
* ฟังก์ชันล้าง Canvas ของ Ticket ทั้งหมด
*/
function clearTicketHighlight() {
if (!ticketCtx) return;
    ticketCtx.clearRect(0, 0, ticketCanvas.width, ticketCanvas.height);
}