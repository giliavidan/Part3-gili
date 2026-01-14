document.addEventListener("DOMContentLoaded", function () {

    // הגדרת משתנים לטעינת התפריט והפוטר
    const navbarPlaceholder = document.getElementById("navbar-placeholder");
    const footerPlaceholder = document.getElementById("footer-placeholder");
    const loadPromises = [];

    // --- 1. טעינת ה-Navbar ---
    if (navbarPlaceholder) {
        const navPromise = fetch("navbar.html")
            .then(response => response.text())
            .then(data => {
                navbarPlaceholder.innerHTML = data;
            })
            .catch(error => console.error("Error loading navbar:", error));
        loadPromises.push(navPromise);
    }

    // --- 2. טעינת ה-Footer ---
    if (footerPlaceholder) {
        const footerPromise = fetch("footer.html")
            .then(response => response.text())
            .then(data => {
                footerPlaceholder.innerHTML = data;
            })
            .catch(error => console.error("Error loading footer:", error));
        loadPromises.push(footerPromise);
    }

    // --- 3. סיום הטעינה ---
    Promise.all(loadPromises).then(() => {

        // --- השינוי הגדול: בדיקת חיבור לפני עדכון הכפתור ---
        restoreSessionIfNeeded();
        // ---------------------------------------------------

        // גלילה לאלמנט ספציפי אם יש בכתובת #
        if (window.location.hash) {
            setTimeout(() => {
                const element = document.querySelector(window.location.hash);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
        document.body.classList.add("page-loaded");
    });
});

/**
 * פונקציה חדשה: משחזרת את החיבור מהשרת אם צריך
 */
async function restoreSessionIfNeeded() {
    if (!sessionStorage.getItem("isLoggedIn")) {
        try {
            const res = await fetch('/api/check-session');
            const data = await res.json();

            if (data.isLoggedIn) {
                sessionStorage.setItem('userId', data.user.id);
                sessionStorage.setItem('userFirstName', data.user.firstName);
                sessionStorage.setItem('userRole', data.user.role);
                sessionStorage.setItem('isLoggedIn', 'true');

                if (data.user.membershipType) {
                    localStorage.setItem('userMembershipType', data.user.membershipType);
                }
            }
        } catch (e) {
            console.log("No session to restore");
        }
    }

    updateSingleAuthButton();
}

/**
 * פונקציה שמטפלת בכפתור האחד והיחיד: authBtn
 */
function updateSingleAuthButton() {
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;

    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const firstName = sessionStorage.getItem('userFirstName');

    // === מצב מחובר ===
    if (isLoggedIn === 'true') {
        authBtn.textContent = 'שלום, ' + firstName;
        authBtn.href = "#";

        authBtn.onclick = function (event) {
            event.preventDefault();

            // כאן במקום confirm משתמשים ב-popup הגלובלי
            showConfirm('האם את/ה רוצה להתנתק ?', function () {
                fetch('/logout')
                    .then(() => {
                        sessionStorage.clear();
                        localStorage.removeItem('userMembershipType');
                        window.location.href = "index.html";
                    });
            });
        };

        // === מצב אורח ===
    } else {
        authBtn.textContent = 'הרשמה / התחברות';
        authBtn.href = "login.html";
        authBtn.onclick = null;
    }

    if (document.body.id === 'page_login') {
        authBtn.style.display = 'none';
    }
}

/* -------- Global popup message helper (used instead of alert) -------- */
function showMessage(text) {
    const overlay   = document.getElementById('global-message-overlay');
    const msgText   = document.getElementById('global-message-text');
    const okBtn     = document.getElementById('global-message-ok');
    const cancelBtn = document.getElementById('global-message-cancel');

    if (!overlay || !msgText || !okBtn) return;

    msgText.textContent = text;

    // הודעה רגילה – לא צריך כפתור ביטול
    if (cancelBtn) cancelBtn.style.display = 'none';

    overlay.classList.remove('msg-hidden');

    okBtn.onclick = function () {
        overlay.classList.add('msg-hidden');
    };
}

// פונקציית אישור/ביטול עם אותו popup גלובלי
function showConfirm(text, onConfirm, onCancel) {
    const overlay   = document.getElementById('global-message-overlay');
    const msgText   = document.getElementById('global-message-text');
    const okBtn     = document.getElementById('global-message-ok');
    const cancelBtn = document.getElementById('global-message-cancel');

    if (!overlay || !msgText || !okBtn || !cancelBtn) return;

    msgText.textContent = text;
    cancelBtn.style.display = 'inline-block';

    overlay.classList.remove('msg-hidden');

    okBtn.onclick = function () {
        overlay.classList.add('msg-hidden');
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    };

    cancelBtn.onclick = function () {
        overlay.classList.add('msg-hidden');
        if (typeof onCancel === 'function') {
            onCancel();
        }
    };
}

// לחשוף את הפונקציות כך שקבצים אחרים יוכלו להשתמש בהן
window.showMessage  = showMessage;
window.showConfirm  = showConfirm;
window.restoreSessionIfNeeded = restoreSessionIfNeeded;
