---
title: "Event Registration"
header_menu_title: "Registration"
navigation_menu_title: "Registration"
weight: 3
header_menu: true
---

{{< rawhtml >}}
<style>
    /* Responsive styles for the form 
    form {
        max-width: 400px;
        margin: 0 auto;
    }

    label {
        display: block;
        margin-bottom: 10px;
    }

    input[type="text"],
    input[type="number"],
    input[type="email"],
    input[type="tel"],
    select {
        width: 100%;
        padding: 10px;
        margin-bottom: 20px;
        border: 1px solid #ccc;
        border-radius: 5px;
        font-size: 16px;
    }

    p {
        font-weight: bold;
        margin-top: 20px;
    }

    button {
        background-color: #007bff;
        color: #fff;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 18px;
        cursor: pointer;
    } */
</style>
<form data-netlify="true" netlify-honeypot method="POST" name="registration">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required><br><br>

    <label for="numRacers">Number of Racers:</label>
    <input type="number" id="numRacers" name="numRacers" min="1" required><br><br>

    <label for="numSpectators">Number of Spectators:</label>
    <input type="number" id="numSpectators" name="numSpectators" min="0" required><br><br>

    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required><br><br>

    <label for="phone">Phone:</label>
    <input type="tel" id="phone" name="phone" pattern="[0-9]{10}" required><br><br>

    <p>Select the category of car for each racer:</p>
    <div id="carCategories">
        <!-- JavaScript will dynamically add car category fields based on the number of racers -->
    </div>

    <label for="sponsorship">Would you like to be a sponsor?</label>
    <input type="checkbox" id="sponsorship" name="sponsorship" value="yes">
    <br><br>

    <div id="sponsorshipFields" style="display: none;">
        <label for="sponsorName">Sponsor Name:</label>
        <input type="text" id="sponsorName" name="sponsorName"><br><br>

        <label for="sponsorLevel">Select Sponsorship Level:</label>
        <select id="sponsorLevel" name="sponsorLevel">
            <option value="Starting Line - $200">Starting Line - $200</option>
            <option value="Yellow Flag - $300">Yellow Flag - $300</option>
            <option value="Pit Row - $500">Pit Row - $500</option>
            <option value="Checkered Flag - $1000">Checkered Flag - $1000</option>
            <option value="Burnout - $1500">Burnout - $1500</option>
        </select><br><br>
    </div>

    <button type="submit">Submit</button>
</form>
<script>
        // JavaScript to show/hide sponsorship fields based on checkbox
        const sponsorshipCheckbox = document.getElementById("sponsorship");
        const sponsorshipFields = document.getElementById("sponsorshipFields");

        sponsorshipCheckbox.addEventListener("change", () => {
            if (sponsorshipCheckbox.checked) {
                sponsorshipFields.style.display = "block";
            } else {
                sponsorshipFields.style.display = "none";
            }
        });

        // JavaScript to dynamically add car category fields based on the number of racers
        const numRacersInput = document.getElementById("numRacers");
        const carCategoriesDiv = document.getElementById("carCategories");

        numRacersInput.addEventListener("input", () => {
            const numRacers = numRacersInput.value;
            carCategoriesDiv.innerHTML = ""; // Clear previous car category fields

            for (let i = 1; i <= numRacers; i++) {
                const label = document.createElement("label");
                label.textContent = `Car Category for Racer ${i}:`;
                const select = document.createElement("select");
                select.name = `carCategory${i}`;
                const stockOption = document.createElement("option");
                stockOption.value = "stock";
                stockOption.textContent = "Stock";
                const unlimitedOption = document.createElement("option");
                unlimitedOption.value = "unlimited";
                unlimitedOption.textContent = "Unlimited";
                select.appendChild(stockOption);
                select.appendChild(unlimitedOption);

                carCategoriesDiv.appendChild(label);
                carCategoriesDiv.appendChild(select);
                carCategoriesDiv.appendChild(document.createElement("br"));
            }
        });
    </script>
{{< /rawhtml >}}