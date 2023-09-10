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
        font-weight: bold;
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
</style>
<form data-netlify="true" netlify-honeypot method="POST" action="/registration-thankyou" name="registration">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required><br>

    <label for="numRacers">Number of Racers:</label>
    <input type="number" id="numRacers" name="numRacers" min="0" max="5" value="1" required><br>

    <label for="numSpectators">Number of Spectators:</label>
    <input type="number" id="numSpectators" name="numSpectators" min="0" value="0" required><br>

    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required><br>

    <label for="phone">Phone (with area code):</label>
    <input type="tel" id="phone" name="phone" pattern="1?[0-9]{10}" required><br>
   
    <div id="carCategories">
        <p>Select the category of car for each racer:</p>
        
        <!-- JavaScript will dynamically add car category fields based on the number of racers -->
        <div id="car1CategoryFields" style="display: none;">
        <label for="car1Category">Car #1:</label>
        <select id="car1Category" name="car1Category">
            <option value="">-- Select one --</option>
            <option value="stock">Stock</option>
            <option value="outlaw">Outlaw</option>
        </select><br>
        </div>
        <div id="car2CategoryFields" style="display: none;">
        <label for="car2Category">Car #2:</label>
        <select id="car2Category" name="car2Category">
            <option value="">-- Select one --</option>
            <option value="stock">Stock</option>
            <option value="outlaw">Outlaw</option>
        </select><br>
        </div>
        <div id="car3CategoryFields" style="display: none;">
        <label for="car3Category">Car #3:</label>
        <select id="car3Category" name="car3Category">
            <option value="">-- Select one --</option>
            <option value="stock">Stock</option>
            <option value="outlaw">Outlaw</option>
        </select><br>
        </div>
        <div id="car4CategoryFields" style="display: none;">
        <label for="car4Category">Car #4:</label>
        <select id="car4Category" name="car4Category">
            <option value="">-- Select one --</option>
            <option value="stock">Stock</option>
            <option value="outlaw">Outlaw</option>
        </select><br>
        </div>
        <div id="car5CategoryFields" style="display: none;">
        <label for="car5Category">Car #5:</label>
        <select id="car5Category" name="car5Category">
            <option value="">-- Select one --</option>
            <option value="stock">Stock</option>
            <option value="outlaw">Outlaw</option>
        </select><br>
        </div>
    </div>

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

    <button type="submit">Submit</button>
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
        const carCategoriesDiv = document.getElementById("carCategories");

        const refreshCarCategories = () => {
            const carCategoriesDiv = document.getElementById("carCategories");
            if (numRacersInput.value.trim() === ""){
                carCategoriesDiv.style.display = "none";
                return;
            } 
            
            carCategoriesDiv.style.display = "block";
            const numRacers = Math.floor(numRacersInput.value, 5);

            for (let i = 1; i <= 5; i++) {
                const fieldName = 'car' + i + 'CategoryFields';
                const carCategoryFields = document.getElementById(fieldName);
                carCategoryFields.style.display = (i <= numRacers) ? "block" : "none";
            };
            };

        numRacersInput.addEventListener("input", 
        refreshCarCategories);

        refreshCarCategories();

    </script>
{{< /rawhtml >}}