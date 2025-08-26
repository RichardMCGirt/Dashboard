function togglePrompt(event) {
    event.preventDefault();

    if (sessionStorage.getItem("salesAccess") === "true") {
        window.location.href = "/sales.html";
        return;
    }

    const correctPassword = "Vanir";
    const savedPasswords = JSON.parse(localStorage.getItem("savedPasswords")) || [];

    // Try auto-login if correct password is stored
    if (savedPasswords.includes(correctPassword)) {
        sessionStorage.setItem("salesAccess", "true");
        window.location.href = "/sales.html";
        return;
    }

    const promptBox = document.querySelector(".password-prompt");
    promptBox.style.display = (promptBox.style.display === "block") ? "none" : "block";

    loadPreviousPasswords(); // Load saved passwords when showing prompt
}

function validatePassword() {
    const password = document.getElementById("password-input").value;
    const correctPassword = "Vanir";
    document.getElementById("submit-btn").disabled = password !== correctPassword;
}

function checkPassword() {
    const password = document.getElementById("password-input").value;
    const correctPassword = "Vanir";

    if (password === correctPassword) {
        sessionStorage.setItem("salesAccess", "true");
        savePassword(password); // Save password for future autofill
        window.location.href = "/sales.html";
    } else {
        alert("Incorrect password!");
    }
}

function savePassword(password) {
    const correctPassword = "Vanir";
    if (password !== correctPassword) return; // Only save if it matches the correct password

    let savedPasswords = JSON.parse(localStorage.getItem("savedPasswords")) || [];
    if (!savedPasswords.includes(password)) {
        savedPasswords.push(password);
        localStorage.setItem("savedPasswords", JSON.stringify(savedPasswords));
    }
}

function loadPreviousPasswords() {
    const correctPassword = "Vanir";
    const savedPasswords = JSON.parse(localStorage.getItem("savedPasswords")) || [];
    const container = document.getElementById("previous-passwords");
    container.innerHTML = "";

    savedPasswords.forEach((pass, index) => {
        if (pass !== correctPassword) return; // Only display if it matches the correct password

        const div = document.createElement("div");
        div.classList.add("password-item");

        const maskedPass = "#".repeat(pass.length);
        const passSpan = document.createElement("span");
        passSpan.textContent = maskedPass;
        passSpan.dataset.actualPass = pass;
        passSpan.classList.add("clickable-password");
        passSpan.style.color = "blue";
        passSpan.style.textDecoration = "underline";
        passSpan.style.cursor = "pointer";
        passSpan.onclick = function () {
            document.getElementById("password-input").value = passSpan.dataset.actualPass;
            validatePassword();
        };

        const unhideButton = document.createElement("button");
        unhideButton.textContent = "Unhide";
        unhideButton.onclick = function () {
            if (passSpan.textContent === maskedPass) {
                passSpan.textContent = passSpan.dataset.actualPass;
                unhideButton.textContent = "Hide";
            } else {
                passSpan.textContent = maskedPass;
                unhideButton.textContent = "Unhide";
            }
        };

        div.appendChild(passSpan);
        div.appendChild(unhideButton);
        container.appendChild(div);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    if (window.location.pathname === "/sales.html") {
        if (sessionStorage.getItem("salesAccess") !== "true") {
            alert("You need to enter the password to access this page.");
            window.location.href = "/index.html";
        }
    }
});
