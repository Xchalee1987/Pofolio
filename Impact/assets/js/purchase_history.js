const delBtns = document.querySelectorAll('.delTransactionBtn');

delBtns.forEach(btn => {
    btn.addEventListener("click", function(e) {
        e.preventDefault();

        const trans_id = e.target.dataset.transactionId;
        // data-transaction-id (with a hyphen) in HTML becomes dataset.transactionId in JS.

        confirmDelete(trans_id);
    });
});
    
async function confirmDelete(id) {
    if (confirm(`คุณแน่ใจว่าต้องการลบรายการสั่งซื้อ [Trans ID: ${id}] หรือไม่?`)) {
        try {
            const response = await fetch(`/admin/delete/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('ลบรายการสำเร็จ');
                // Reload the page to show the transaction is gone
                window.location.reload();
            } else {
                // Handle server errors (e.g., 404, 500)
                alert('เกิดข้อผิดพลาด: ไม่สามารถลบรายการได้');
            }
        } catch (error) {
            // Handle network errors (e.g., server is down)
            console.error('Network error:', error.message);
            alert('เกิดข้อผิดพลาดทางเครือข่าย');
        }
    }
}