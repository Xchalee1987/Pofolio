const delUserBtns = document.querySelectorAll('.del-user');

delUserBtns.forEach(delBtn => {
    delBtn.addEventListener("click", function(e) {
        e.preventDefault();

        const trans_id = e.target.dataset.userId;
        // data-transaction-id (with a hyphen) in HTML becomes dataset.transactionId in JS.

        confirmDelete(trans_id);
    });
});
    
async function confirmDelete(id) {
    if (confirm(`ยืนยันการลบผู้ใช้ User ID: ${id} หรือไม่?`)) {
        try {
            const response = await fetch(`/admin/userDelete/${id}`, { method: 'DELETE' });
            console.log(response);
            if (response.ok) {
                alert('ลบรายการสำเร็จ');
                // Reload the page after deleted user
                window.location.reload();
            } else {
                // Handle server errors (e.g., 404, 500)
                alert('เกิดข้อผิดพลาด: ไม่สามารถลบผู้ใช้ได้');
            }
        } catch (error) {
            // Handle network errors (e.g., server is down)
            console.error('Network error:', error.message);
            alert('เกิดข้อผิดพลาดทางเครือข่าย');
        }
    }
}