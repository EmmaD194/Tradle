"use strict";

// ---------------------------------
// GAME SETTINGS
// ---------------------------------

const clipLengths = [1, 2, 3, 4, 5];

const maximumAttempts = clipLengths.length;
const maximumSuggestions = 8;



const timingChoices = [
    "Reel",
    "Jig",
    "Single Jig",
    "Slip Jig",
    "Hornpipe",
    "Mix"
];

// ---------------------------------
// TUNE DATA
// ---------------------------------

let tunes = [];

// ---------------------------------
// GAME STATE
// ---------------------------------

let currentTune = null;
let currentTuneIndex = -1;
let previousTuneIndex = -1;

let currentAttempt = 1;
let gameFinished = false;

let clipStartTime = null;
let clipTimeout = null;

let visibleSuggestions = [];
let selectedSuggestionIndex = -1;

let timingAnswered = false;
let bpmAnswered = false;

let timingCorrect = false;
let bpmCorrect = false;

let leadAnswered = false;
let leadCorrect = false;

let setAnswered = false;
let setCorrect = false;

// ---------------------------------
// AUDIO
// ---------------------------------

const audio = new Audio();

audio.preload = "auto";

// ---------------------------------
// PAGE ELEMENTS
// ---------------------------------

const playButton = document.getElementById("playButton");

const guessForm = document.getElementById("guessForm");
const guessInput = document.getElementById("guessInput");
const guessButton = document.getElementById("guessButton");

const suggestions = document.getElementById("suggestions");

const attemptText = document.getElementById("attemptText");
const clipText = document.getElementById("clipText");
const attemptBars = document.getElementById("attemptBars");

const message = document.getElementById("message");

const results = document.getElementById("results");
const resultHeading = document.getElementById("resultHeading");
const answerText = document.getElementById("answerText");
const newGameButton = document.getElementById("newGameButton");

const bonusRound = document.getElementById("bonusRound");

const timingRound = document.getElementById("timingRound");
const timingOptions = document.getElementById("timingOptions");
const timingFeedback = document.getElementById("timingFeedback");

const bpmRound = document.getElementById("bpmRound");
const bpmOptions = document.getElementById("bpmOptions");
const bpmFeedback = document.getElementById("bpmFeedback");

const leadRound = document.getElementById("leadRound");
const leadOptions = document.getElementById("leadOptions");
const leadFeedback = document.getElementById("leadFeedback");

const setRound = document.getElementById("setRound");
const setOptions = document.getElementById("setOptions");
const setFeedback = document.getElementById("setFeedback");

const bonusSummary = document.getElementById("bonusSummary");

// ---------------------------------
// LOAD THE TUNE LIBRARY
// ---------------------------------

async function initialiseGame() {
    try {
        setLoadingState(true);

        const response = await fetch("data/tunes.json");

        if (!response.ok) {
            throw new Error(
                `Could not load tunes.json. HTTP status: ${response.status}`
            );
        }

        const tuneData = await response.json();

        if (!Array.isArray(tuneData) || tuneData.length === 0) {
            throw new Error("The tune library is empty.");
        }

        tunes = tuneData.filter(isValidTune);

        if (tunes.length === 0) {
            throw new Error(
                "No valid tunes were found in tunes.json."
            );
        }

        setLoadingState(false);
        startNewGame();
    } catch (error) {
        console.error("Tradle could not start:", error);

        message.textContent =
            "The tune library could not be loaded. Check data/tunes.json.";

        message.className = "message error";

        playButton.disabled = true;
        guessButton.disabled = true;
        guessInput.disabled = true;
    }
}

function isValidTune(tune) {
    return (
        tune &&
        typeof tune.title === "string" &&
        tune.title.trim() !== "" &&
        typeof tune.audio === "string" &&
        tune.audio.trim() !== "" &&
        typeof tune.type === "string" &&
        tune.type.trim() !== "" &&
        Number.isFinite(Number(tune.bpm))
    );
}

function setLoadingState(isLoading) {
    playButton.disabled = isLoading;
    guessButton.disabled = isLoading;
    guessInput.disabled = isLoading;

    if (isLoading) {
        playButton.textContent = "Loading tunes...";
    }
}

// ---------------------------------
// START A NEW GAME
// ---------------------------------

function startNewGame() {
    stopAudio();
    hideSuggestions();
    resetAttemptBars();
    resetBonusRound();

    currentAttempt = 1;
    gameFinished = false;
    clipStartTime = null;

    currentTuneIndex = getRandomTuneIndex();
    previousTuneIndex = currentTuneIndex;
    currentTune = tunes[currentTuneIndex];

    audio.src = currentTune.audio;
    audio.load();

    guessInput.value = "";
    guessInput.disabled = false;
    guessButton.disabled = false;
    playButton.disabled = false;

    message.textContent = "";
    message.className = "message";

    results.classList.add("hidden");
    newGameButton.classList.add("hidden");

    resultHeading.textContent = "";
    answerText.textContent = "";

    updateGameDisplay();

    guessInput.focus();
}

// ---------------------------------
// RANDOM TUNE
// ---------------------------------

function getRandomTuneIndex() {
    if (tunes.length === 0) {
        throw new Error("No tunes are available.");
    }

    if (tunes.length === 1) {
        return 0;
    }

    let randomIndex;

    do {
        randomIndex = Math.floor(Math.random() * tunes.length);
    } while (randomIndex === previousTuneIndex);

    return randomIndex;
}

// ---------------------------------
// AUDIO
// ---------------------------------

function waitForAudioMetadata() {
    return new Promise((resolve, reject) => {
        if (
            Number.isFinite(audio.duration) &&
            audio.duration > 0
        ) {
            resolve();
            return;
        }

        function handleLoadedMetadata() {
            cleanup();
            resolve();
        }

        function handleError() {
            cleanup();

            reject(
                new Error(
                    "The audio metadata could not be loaded."
                )
            );
        }

        function cleanup() {
            audio.removeEventListener(
                "loadedmetadata",
                handleLoadedMetadata
            );

            audio.removeEventListener(
                "error",
                handleError
            );
        }

        audio.addEventListener(
            "loadedmetadata",
            handleLoadedMetadata
        );

        audio.addEventListener(
            "error",
            handleError
        );
    });
}

function chooseRandomClipStart() {
    const longestClip = Math.max(...clipLengths);
    const endBuffer = 0.25;

    const latestPossibleStart =
        audio.duration - longestClip - endBuffer;

    if (latestPossibleStart <= 0) {
        clipStartTime = 0;
        return;
    }

    clipStartTime =
        Math.random() * latestPossibleStart;
}

async function playCurrentClip() {
    if (gameFinished || !currentTune) {
        return;
    }

    stopAudio();

    const clipLength =
        clipLengths[currentAttempt - 1];

    try {
        await waitForAudioMetadata();

        if (clipStartTime === null) {
            chooseRandomClipStart();
        }

        audio.currentTime = clipStartTime;

        await audio.play();

        playButton.textContent = "🔊 Playing...";

        clipTimeout = window.setTimeout(() => {
            audio.pause();
            clipTimeout = null;

            if (!gameFinished) {
                playButton.textContent =
                    "▶ Replay clip";
            }
        }, clipLength * 1000);
    } catch (error) {
        console.error(
            "The audio could not be played:",
            error
        );

        message.textContent =
            "The audio could not be played. Check the audio file path.";

        message.className = "message error";
        playButton.textContent = "▶ Play clip";
    }
}

function stopAudio() {
    if (clipTimeout !== null) {
        window.clearTimeout(clipTimeout);
        clipTimeout = null;
    }

    audio.pause();

    if (!gameFinished) {
        playButton.textContent =
            currentAttempt === 1
                ? "▶ Play clip"
                : "▶ Replay clip";
    }
}

// ---------------------------------
// SUBMIT A TUNE GUESS
// ---------------------------------

function submitGuess(event) {
    event.preventDefault();

    hideSuggestions();

    if (gameFinished || !currentTune) {
        return;
    }

    const submittedGuess = guessInput.value.trim();

    if (submittedGuess === "") {
        message.textContent = "Enter a tune name first.";
        message.className = "message error";

        guessInput.focus();
        return;
    }

    if (guessMatchesTune(submittedGuess, currentTune)) {
        finishMainGame(true);
        return;
    }

    markAttemptBar(currentAttempt - 1, "failed");

    if (currentAttempt >= maximumAttempts) {
        finishMainGame(false);
        return;
    }

    currentAttempt += 1;

    const nextClipLength =
        clipLengths[currentAttempt - 1];

    message.textContent =
        `Not quite. You now get ${nextClipLength} seconds.`;

    message.className = "message error";

    guessInput.value = "";

    updateGameDisplay();
    guessInput.focus();
}

function guessMatchesTune(guess, tune) {
    const acceptedNames = [
        tune.title,
        ...(Array.isArray(tune.aliases)
            ? tune.aliases
            : [])
    ];

    const normalisedGuess =
        normaliseTuneName(guess);

    return acceptedNames.some(
        (name) =>
            normaliseTuneName(name) ===
            normalisedGuess
    );
}

// ---------------------------------
// NORMALISE TUNE NAMES
// ---------------------------------

function normaliseTuneName(value) {
    return String(value)
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^the\s+/, "")
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ");
}

function normaliseAnswer(value) {
    return String(value)
        .toLowerCase()
        .trim();
}

// ---------------------------------
// AUTOCOMPLETE
// ---------------------------------

function showSuggestions() {
    if (gameFinished) {
        hideSuggestions();
        return;
    }

    const searchValue =
        normaliseTuneName(guessInput.value);

    suggestions.innerHTML = "";
    visibleSuggestions = [];
    selectedSuggestionIndex = -1;

    if (searchValue === "") {
        hideSuggestions();
        return;
    }

    visibleSuggestions = tunes
        .filter((tune) =>
            tuneMatchesSearch(tune, searchValue)
        )
        .sort((firstTune, secondTune) =>
            compareTuneMatches(
                firstTune,
                secondTune,
                searchValue
            )
        )
        .slice(0, maximumSuggestions);

    if (visibleSuggestions.length === 0) {
        const emptyMessage =
            document.createElement("div");

        emptyMessage.className =
            "no-suggestions";

        emptyMessage.textContent =
            "No matching tunes";

        suggestions.appendChild(emptyMessage);
        suggestions.classList.remove("hidden");

        guessInput.setAttribute(
            "aria-expanded",
            "true"
        );

        return;
    }

    visibleSuggestions.forEach((tune, index) => {
        const suggestionButton =
            document.createElement("button");

        suggestionButton.type = "button";
        suggestionButton.className = "suggestion";
        suggestionButton.textContent = tune.title;

        suggestionButton.setAttribute(
            "role",
            "option"
        );

        suggestionButton.setAttribute(
            "aria-selected",
            "false"
        );

        suggestionButton.addEventListener(
            "mousedown",
            (event) => {
                event.preventDefault();
            }
        );

        suggestionButton.addEventListener(
            "click",
            () => {
                chooseSuggestion(index);
            }
        );

        suggestions.appendChild(
            suggestionButton
        );
    });

    suggestions.classList.remove("hidden");

    guessInput.setAttribute(
        "aria-expanded",
        "true"
    );
}

function tuneMatchesSearch(tune, searchValue) {
    const searchableNames = [
        tune.title,
        ...(Array.isArray(tune.aliases)
            ? tune.aliases
            : [])
    ];

    return searchableNames.some((name) =>
        normaliseTuneName(name).includes(
            searchValue
        )
    );
}

function compareTuneMatches(
    firstTune,
    secondTune,
    searchValue
) {
    const firstTitle =
        normaliseTuneName(firstTune.title);

    const secondTitle =
        normaliseTuneName(secondTune.title);

    const firstStartsWith =
        firstTitle.startsWith(searchValue);

    const secondStartsWith =
        secondTitle.startsWith(searchValue);

    if (firstStartsWith && !secondStartsWith) {
        return -1;
    }

    if (!firstStartsWith && secondStartsWith) {
        return 1;
    }

    return firstTune.title.localeCompare(
        secondTune.title
    );
}

function chooseSuggestion(index) {
    const selectedTune =
        visibleSuggestions[index];

    if (!selectedTune) {
        return;
    }

    guessInput.value = selectedTune.title;

    hideSuggestions();
    guessInput.focus();
}

function hideSuggestions() {
    suggestions.classList.add("hidden");
    suggestions.innerHTML = "";

    visibleSuggestions = [];
    selectedSuggestionIndex = -1;

    guessInput.setAttribute(
        "aria-expanded",
        "false"
    );
}

function moveSuggestionSelection(direction) {
    if (visibleSuggestions.length === 0) {
        return;
    }

    if (direction === "down") {
        selectedSuggestionIndex =
            (selectedSuggestionIndex + 1) %
            visibleSuggestions.length;
    }

    if (direction === "up") {
        selectedSuggestionIndex =
            selectedSuggestionIndex <= 0
                ? visibleSuggestions.length - 1
                : selectedSuggestionIndex - 1;
    }

    updateHighlightedSuggestion();
}

function updateHighlightedSuggestion() {
    const suggestionButtons =
        suggestions.querySelectorAll(
            ".suggestion"
        );

    suggestionButtons.forEach(
        (button, index) => {
            const isSelected =
                index ===
                selectedSuggestionIndex;

            button.classList.toggle(
                "active",
                isSelected
            );

            button.setAttribute(
                "aria-selected",
                String(isSelected)
            );
        }
    );

    const selectedButton =
        suggestionButtons[
            selectedSuggestionIndex
        ];

    if (selectedButton) {
        selectedButton.scrollIntoView({
            block: "nearest"
        });
    }
}

// ---------------------------------
// FINISH THE MAIN GAME
// ---------------------------------

function finishMainGame(playerWon) {
    gameFinished = true;

    stopAudio();
    hideSuggestions();

    guessInput.disabled = true;
    guessButton.disabled = true;
    playButton.disabled = true;

    results.classList.remove("hidden");

    if (playerWon) {
        markAttemptBar(
            currentAttempt - 1,
            "correct"
        );

        message.textContent = "Correct!";
        message.className = "message success";

        resultHeading.textContent = "You got it";

        answerText.textContent =
            `The tune was “${currentTune.title}”.`;

        startBonusRound();
        return;
    }

    message.textContent = "Game over.";
    message.className = "message error";

    resultHeading.textContent =
        "Better luck next tune";

    answerText.textContent =
        `The answer was “${currentTune.title}”.`;

    bonusRound.classList.add("hidden");
    newGameButton.classList.remove("hidden");
    newGameButton.focus();
}

// ---------------------------------
// BONUS ROUNDS
// ---------------------------------

function resetBonusRound() {
    timingAnswered = false;
    timingCorrect = false;

    bpmAnswered = false;
    bpmCorrect = false;

    leadAnswered = false;
    leadCorrect = false;

    setAnswered = false;
    setCorrect = false;

    bonusRound.classList.add("hidden");

    timingRound.classList.remove("hidden");
    bpmRound.classList.add("hidden");
    leadRound.classList.add("hidden");
    setRound.classList.add("hidden");

    bonusSummary.classList.add("hidden");

    timingOptions.innerHTML = "";
    bpmOptions.innerHTML = "";
    leadOptions.innerHTML = "";
    setOptions.innerHTML = "";

    timingFeedback.textContent = "";
    timingFeedback.className = "bonus-feedback";

    bpmFeedback.textContent = "";
    bpmFeedback.className = "bonus-feedback";

    leadFeedback.textContent = "";
    leadFeedback.className = "bonus-feedback";

    setFeedback.textContent = "";
    setFeedback.className = "bonus-feedback";

    bonusSummary.textContent = "";
}

function startBonusRound() {
    resetBonusRound();

    bonusRound.classList.remove("hidden");
    timingRound.classList.remove("hidden");

    const options =
        createTimingOptions(currentTune.type);

    renderBonusOptions(
        timingOptions,
        options,
        answerTimingQuestion
    );
}

function createTimingOptions(correctTiming) {
    const availableTimings = Array.from(
        new Set([
            ...timingChoices,
            correctTiming
        ])
    ).filter(
        (timing) =>
            normaliseAnswer(timing) !==
            normaliseAnswer(correctTiming)
    );

    const distractors = shuffleArray(
        availableTimings
    ).slice(0, 3);

    return shuffleArray([
        correctTiming,
        ...distractors
    ]);
}

function answerTimingQuestion(
    selectedTiming,
    selectedButton
) {
    
    if (timingAnswered) {
        return;
    }

    timingAnswered = true;

    const correctTiming = currentTune.type;

    const answerIsCorrect =
        normaliseAnswer(selectedTiming) ===
        normaliseAnswer(correctTiming);
    
        timingCorrect = answerIsCorrect;

    revealCorrectOption(
        timingOptions,
        correctTiming,
        selectedButton,
        answerIsCorrect
    );

    if (answerIsCorrect) {
        timingFeedback.textContent =
            "Correct! On to the BPM.";

        timingFeedback.className =
            "bonus-feedback success";

        startBpmRound();
        return;
    }

    timingFeedback.textContent =
        `Not quite. The correct timing was ${correctTiming}.`;

    timingFeedback.className =
        "bonus-feedback error";

    bonusSummary.textContent =
        "Tune correct, timing missed.";

    bonusSummary.classList.remove("hidden");
    newGameButton.classList.remove("hidden");
}

function startBpmRound() {
    bpmRound.classList.remove("hidden");

    const options =
        createBpmOptions(Number(currentTune.bpm));

    renderBonusOptions(
        bpmOptions,
        options,
        answerBpmQuestion,
        (option) => `${option} BPM`
    );
}

function createBpmOptions(correctBpm) {
    const offsets = shuffleArray([
        -9,
        -6,
        -4,
        -3,
        3,
        4,
        6,
        9
    ]);

    const options = new Set([correctBpm]);

    for (const offset of offsets) {
        const possibleBpm =
            correctBpm + offset;

        if (possibleBpm > 0) {
            options.add(possibleBpm);
        }

        if (options.size === 4) {
            break;
        }
    }

    return shuffleArray(
        Array.from(options)
    );
}

function answerBpmQuestion(
    selectedBpm,
    selectedButton
) {
    if (bpmAnswered) {
        return;
    }

    bpmAnswered = true;

    const correctBpm = Number(currentTune.bpm);

    const answerIsCorrect =
        Number(selectedBpm) === correctBpm;

    bpmCorrect = answerIsCorrect;

    revealCorrectOption(
        bpmOptions,
        correctBpm,
        selectedButton,
        answerIsCorrect
    );

    if (answerIsCorrect) {
        bpmFeedback.textContent =
            "Correct!";

        bpmFeedback.className =
            "bonus-feedback success";
    } else {
        bpmFeedback.textContent =
            `Not quite. The correct speed was ${correctBpm} BPM.`;

        bpmFeedback.className =
            "bonus-feedback error";
    }

    /*
     * Traditional sets continue to the lead
     * and set bar questions.
     */
    if (currentTune.modern === true) {
        startLeadRound();
        return;
    }

    finishBonusSequence();
}

function renderBonusOptions(
    container,
    options,
    answerHandler,
    labelFormatter = (option) => option
) {
    container.innerHTML = "";

    options.forEach((option) => {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "bonus-option";
        button.textContent =
            labelFormatter(option);

        button.dataset.value =
            String(option);

        button.addEventListener(
            "click",
            () => {
                answerHandler(option, button);
            }
        );

        container.appendChild(button);
    });
}

function revealCorrectOption(
    container,
    correctAnswer,
    selectedButton,
    answerIsCorrect
) {
    const buttons =
        container.querySelectorAll(
            ".bonus-option"
        );

    buttons.forEach((button) => {
        button.disabled = true;

        const buttonIsCorrect =
            normaliseAnswer(
                button.dataset.value
            ) ===
            normaliseAnswer(correctAnswer);

        if (buttonIsCorrect) {
            button.classList.add(
                "correct-answer"
            );
        }
    });

    if (!answerIsCorrect && selectedButton) {
        selectedButton.classList.add(
            "wrong-answer"
        );
    }
}

function shuffleArray(array) {
    const shuffled = [...array];

    for (
        let index = shuffled.length - 1;
        index > 0;
        index -= 1
    ) {
        const randomIndex =
            Math.floor(
                Math.random() * (index + 1)
            );

        [
            shuffled[index],
            shuffled[randomIndex]
        ] = [
            shuffled[randomIndex],
            shuffled[index]
        ];
    }

    return shuffled;
}

function startLeadRound() {
    const correctLeadBars =
        Number(currentTune.lead);

    if (!Number.isFinite(correctLeadBars)) {
        console.error(
            `No valid lead value for ${currentTune.title}`
        );

        startSetRound();
        return;
    }

    leadRound.classList.remove("hidden");

    const options =
        createBarOptions(correctLeadBars);

    renderBonusOptions(
        leadOptions,
        options,
        answerLeadQuestion,
        (option) => `${option} bars`
    );
}

function answerLeadQuestion(
    selectedBars,
    selectedButton
) {
    if (leadAnswered) {
        return;
    }

    leadAnswered = true;

    const correctLeadBars =
        Number(currentTune.lead);

    const answerIsCorrect =
        Number(selectedBars) ===
        correctLeadBars;

    leadCorrect = answerIsCorrect;

    revealCorrectOption(
        leadOptions,
        correctLeadBars,
        selectedButton,
        answerIsCorrect
    );

    if (answerIsCorrect) {
        leadFeedback.textContent =
            "Correct!";

        leadFeedback.className =
            "bonus-feedback success";
    } else {
        leadFeedback.textContent =
            `Not quite. The lead has ${correctLeadBars} bars.`;

        leadFeedback.className =
            "bonus-feedback error";
    }

    startSetRound();
}

function startSetRound() {
    const correctSetBars =
        Number(currentTune.set);

    if (!Number.isFinite(correctSetBars)) {
        console.error(
            `No valid set value for ${currentTune.title}`
        );

        finishBonusSequence();
        return;
    }

    setRound.classList.remove("hidden");

    const options =
        createBarOptions(correctSetBars);

    renderBonusOptions(
        setOptions,
        options,
        answerSetQuestion,
        (option) => `${option} bars`
    );
}

function answerSetQuestion(
    selectedBars,
    selectedButton
) {
    if (setAnswered) {
        return;
    }

    setAnswered = true;

    const correctSetBars =
        Number(currentTune.set);

    const answerIsCorrect =
        Number(selectedBars) ===
        correctSetBars;

    setCorrect = answerIsCorrect;

    revealCorrectOption(
        setOptions,
        correctSetBars,
        selectedButton,
        answerIsCorrect
    );

    if (answerIsCorrect) {
        setFeedback.textContent =
            "Correct!";

        setFeedback.className =
            "bonus-feedback success";
    } else {
        setFeedback.textContent =
            `Not quite. The set has ${correctSetBars} bars.`;

        setFeedback.className =
            "bonus-feedback error";
    }

    finishBonusSequence();
}

function createBarOptions(correctBars) {
    const possibleOffsets = shuffleArray([
        -12,
        -8,
        -4,
        4,
        8,
        12
    ]);

    const options = new Set([
        Number(correctBars)
    ]);

    for (const offset of possibleOffsets) {
        const possibleAnswer =
            Number(correctBars) + offset;

        if (possibleAnswer > 0) {
            options.add(possibleAnswer);
        }

        if (options.size === 4) {
            break;
        }
    }

    /*
     * Fallback in case there were not enough
     * valid values from the offsets.
     */
    let fallbackAnswer = 4;

    while (options.size < 4) {
        if (fallbackAnswer !== correctBars) {
            options.add(fallbackAnswer);
        }

        fallbackAnswer += 4;
    }

    return shuffleArray(
        Array.from(options)
    );
}

function finishBonusSequence() {
    const resultsParts = [
        "Tune ✅",
        `Timing ${timingCorrect ? "✅" : "❌"}`,
        `BPM ${bpmCorrect ? "✅" : "❌"}`
    ];

    if (currentTune.modern === true) {
        resultsParts.push(
            `Lead ${leadCorrect ? "✅" : "❌"}`
        );

        resultsParts.push(
            `Set ${setCorrect ? "✅" : "❌"}`
        );
    }

    bonusSummary.textContent =
        resultsParts.join(" · ");

    bonusSummary.classList.remove("hidden");
    newGameButton.classList.remove("hidden");

    newGameButton.focus();
}

// ---------------------------------
// UPDATE THE DISPLAY
// ---------------------------------

function updateGameDisplay() {
    const clipLength =
        clipLengths[currentAttempt - 1];

    attemptText.textContent =
        `Attempt ${currentAttempt} of ${maximumAttempts}`;

    clipText.textContent =
        `Your clip is ${clipLength} ${
            clipLength === 1
                ? "second"
                : "seconds"
        } long`;

    playButton.textContent =
        currentAttempt === 1
            ? "▶ Play clip"
            : "▶ Replay clip";

    const bars =
        attemptBars.querySelectorAll(
            ".attempt-bar"
        );

    bars.forEach((bar, index) => {
        if (
            !bar.classList.contains("failed") &&
            !bar.classList.contains("correct")
        ) {
            bar.classList.toggle(
                "active",
                index === currentAttempt - 1
            );
        }
    });
}

function markAttemptBar(index, status) {
    const bars =
        attemptBars.querySelectorAll(
            ".attempt-bar"
        );

    const selectedBar = bars[index];

    if (!selectedBar) {
        return;
    }

    selectedBar.classList.remove(
        "active",
        "failed",
        "correct"
    );

    selectedBar.classList.add(status);
}

function resetAttemptBars() {
    const bars =
        attemptBars.querySelectorAll(
            ".attempt-bar"
        );

    bars.forEach((bar, index) => {
        bar.className = "attempt-bar";

        if (index === 0) {
            bar.classList.add("active");
        }
    });
}

// ---------------------------------
// EVENT LISTENERS
// ---------------------------------

playButton.addEventListener(
    "click",
    playCurrentClip
);

guessForm.addEventListener(
    "submit",
    submitGuess
);

newGameButton.addEventListener(
    "click",
    startNewGame
);

guessInput.addEventListener(
    "input",
    showSuggestions
);

guessInput.addEventListener(
    "focus",
    () => {
        if (guessInput.value.trim() !== "") {
            showSuggestions();
        }
    }
);

guessInput.addEventListener(
    "keydown",
    (event) => {
        const suggestionsAreVisible =
            !suggestions.classList.contains(
                "hidden"
            );

        if (
            event.key === "ArrowDown" &&
            suggestionsAreVisible
        ) {
            event.preventDefault();
            moveSuggestionSelection("down");
            return;
        }

        if (
            event.key === "ArrowUp" &&
            suggestionsAreVisible
        ) {
            event.preventDefault();
            moveSuggestionSelection("up");
            return;
        }

        if (
            event.key === "Enter" &&
            suggestionsAreVisible &&
            selectedSuggestionIndex >= 0
        ) {
            event.preventDefault();

            chooseSuggestion(
                selectedSuggestionIndex
            );

            return;
        }

        if (event.key === "Escape") {
            hideSuggestions();
        }
    }
);

document.addEventListener(
    "click",
    (event) => {
        const clickedInsideAutocomplete =
            event.target.closest(
                ".autocomplete"
            );

        if (!clickedInsideAutocomplete) {
            hideSuggestions();
        }
    }
);

audio.addEventListener(
    "ended",
    () => {
        if (!gameFinished) {
            playButton.textContent =
                "▶ Replay clip";
        }
    }
);

audio.addEventListener(
    "error",
    () => {
        if (!currentTune) {
            return;
        }

        message.textContent =
            `The audio file for “${currentTune.title}” could not be loaded.`;

        message.className = "message error";
        playButton.textContent = "▶ Play clip";
    }
);

// ---------------------------------
// BEGIN
// ---------------------------------

initialiseGame();