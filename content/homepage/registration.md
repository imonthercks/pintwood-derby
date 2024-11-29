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
<form data-netlify="true" netlify-honeypot="honey" data-netlify-recaptcha="true" method="POST" action="/registration-thankyou" name="registration" id="registration_form">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required="true"><br>
    <label for="numRacers">Number of Racers ($35 each):</label>
    <input type="number" id="numRacers" name="numRacers" min="0" max="5" value="1" required>&nbsp;&nbsp;&nbsp;
    <input type="checkbox" id="mysteryCubCars" name="mysteryCubCars"> Mystery Cub Car(s)!
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
    <div data-netlify-recaptcha="true"></div>
    <button id="submitButton" type="submit">Submit</button>
</form>
<script>
        // JavaScript to show/hide sponsorship fields based on checkbox
        const sponsorshipCheckbox = document.getElementById("sponsorship");
        const sponsorshipFields = document.getElementById("sponsorshipFields");

        sponsorshipCheckbox.addEventListener("change", () => {
            if (sponsorshipCheckbox.value === "yes") {
                sponsorshipFields.style.display = "block";
            } else {
                sponsorshipFields.style.display = "none";
            }
        });

        // JavaScript to dynamically add car category fields based on the number of racers
        const numRacersInput = document.getElementById("numRacers");

        const validate = () => {
            let success = true;
            let messageText = "";
            const numRacers = Math.floor(numRacersInput.value, 5);

            return success;
        }

        const emailForm = document.getElementById("registration_form");
        emailForm.addEventListener("submit", function (event) {
            // Disable the submit button on first click
            const submitButton = document.getElementById('submitButton');
            submitButton.setAttribute("disabled", "true");
            if (!validate()) {
                event.preventDefault(); // Prevent form submission if email is invalid
            
                setTimeout(function () {
                    submitButton.removeAttribute("disabled");
                }, 1000); 
            }
        });


    </script>
{{< /rawhtml >}}