# Kahoot Answer Helper

**Description:**
A lightweight script that helps you get correct answers in **Kahoot** during live quizzes.
No downloads or installation needed — just open **DevTools Console**, paste the code, and run it.

## 🔧 How It Works

The script:

1. Automatically detects the current page URL and extracts the **quizId**.
2. Sends a request to the API:

   ```
   https://kahoot.it/rest/kahoots/${quizId}
   ```
3. Retrieves a JSON response containing all questions and answers.
4. Identifies which question you’re currently on and displays the correct answer neatly in the console.

## 🚀 Usage

1. Go to the active **Kahoot** quiz page.
2. Open DevTools (`F12` or `Ctrl + Shift + I`).
3. Switch to the **Console** tab.
4. Paste the script.
5. Press **Enter** to get the correct answers instantly.

## ⚠️ Disclaimer

* This script is created **for educational purposes only**.
* The author is **not responsible** for how it’s used or any resulting consequences.

## 📄 License

**MIT License** — you’re free to use, modify, and share it, just don’t blame the author if something goes wrong.
