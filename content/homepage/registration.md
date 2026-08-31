---
title: "Event Registration"
header_menu_title: "Registration"
navigation_menu_title: "Registration"
weight: 3
header_menu: true
---

{{< rawhtml >}}
<style>
    /* Responsive styles for the form */
    form {
        max-width: 400px;
        margin: 0 auto;
    }

    label {
        display: block;
        margin-bottom: 5px;
    }

    input[type="text"],
    input[type="number"],
    input[type="email"],
    input[type="tel"],
    select {
        width: 100%;
        padding: 10px;
        margin-bottom: 15px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 16px;
    }

    input[type="number"] {
        max-width:100px;
    }
    
    input[type="tel"] {
        max-width:200px;
    }
    
    p {
         margin-top: 5px;
    }

    button {
        background-color: #007bff;
        color: #fff;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 18px;
        cursor: pointer;
    } 

    /* Style for error message */
        .error-message {
            color: red;
            font-size: 14px;
            margin-top: 5px;
        }
</style>
<script>
                // client-side: no reCAPTCHA; use a server-side honeypot and client retry on 429
    </script>
<form method="POST" id="registration_form">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required="true"><br>
    <label for="numRacers">Number of Racers ($35 each):</label>
    <input type="number" id="numRacers" name="numRacers" min="0" max="5" value="1" required>&nbsp;&nbsp;&nbsp;
    <input type="checkbox" id="mysteryCubCars" name="mysteryCubCars" value="yes"> Mystery Cub Car(s)!
    <label for="numSpectators">Number of Spectators ($25 each):</label>
    <input type="number" id="numSpectators" name="numSpectators" min="0" value="0" required><br>
    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required><br>
    <label for="phone">Phone (with area code):</label>
    <input type="tel" id="phone" name="phone" pattern="1?[0-9]{10}" required><br>
    <label for="comments">Comments on registration:</label>
    <textarea id="comments" name="comments" cols="30"></textarea>
    <label for="sponsorship">Would you like to be a sponsor?</label>
        <select id="sponsorship" name="sponsorship">
            <option selected value="no">No</option>
            <option value="yes">Yes</option>
        </select><br><br>
    <div id="sponsorshipFields" style="display: none;">
       <label for="sponsorName">Sponsor Name:</label>
        <input type="text" id="sponsorName" name="sponsorName">
        <br><br>
        <label for="sponsorLevel">Select Sponsorship Level:</label>
        <select id="sponsorLevel" name="sponsorLevel">
            <option value="">-- Choose one --</option>
            <option value="Starting Line - $200">Starting Line - $200</option>
            <option value="Yellow Flag - $300">Yellow Flag - $300</option>
            <option value="Pit Row - $500">Pit Row - $500</option>
            <option value="Checkered Flag - $1000">Checkered Flag - $1000</option>
            <option value="Burnout - $1500">Burnout - $1500</option>
        </select><br><br>
    </div>
    <span class="error-message" id="errorMessage"></span>
    <!-- honeypot field — bots fill it, humans don't -->
    <input type="text" name="url" style="display:none" tabindex="-1" autocomplete="off">
    <button id="submitButton" type="submit">Submit</button>
</form>
<script>
        // Show/hide sponsorship fields
        const sponsorshipCheckbox = document.getElementById("sponsorship");
        const sponsorshipFields = document.getElementById("sponsorshipFields");

        sponsorshipCheckbox.addEventListener("change", () => {
            if (sponsorshipCheckbox.value === "yes") {
                sponsorshipFields.style.display = "block";
            } else {
                sponsorshipFields.style.display = "none";
            }
        });

        // Fetch-based form submission to API Gateway
        const form = document.getElementById("registration_form");
        const errorMessage = document.getElementById("errorMessage");
        const submitButton = document.getElementById("submitButton");

        // Plain submit handler with retry on HTTP 429 (exponential backoff + jitter)
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            submitButton.disabled = true;
            errorMessage.textContent = '';

            const data = {};
            new FormData(form).forEach((v, k) => { data[k] = v; });
            const apiEndpoint = {{< apiendpoint >}};

            const maxRetries = 3;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const res = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                    });
                    if (res.ok) {
                        window.location.href = '/registration-thankyou';
                        return;
                    }
                    if (res.status === 429) {
                        if (attempt < maxRetries) {
                            const base = 1000 * Math.pow(2, attempt); // 1s,2s,4s
                            const jitter = Math.floor(Math.random() * 250);
                            await new Promise(r => setTimeout(r, base + jitter));
                            continue;
                        }
                        break;
                    }
                    const json = await res.json().catch(() => ({}));
                    errorMessage.textContent = json.error || 'Submission failed. Please try again.';
                    submitButton.disabled = false;
                    return;
                } catch (e) {
                    errorMessage.textContent = 'Network error. Please try again.';
                    submitButton.disabled = false;
                    return;
                }
            }
            // exhausted retries
            errorMessage.textContent = 'Submission throttled. Please try again in a moment.';
            submitButton.disabled = false;
        });
    </script>
{{< /rawhtml >}}