// ==UserScript==
// @name         Data Matches for StashResults
// @namespace    http://kennyg.com/
// @version      1.11
// @description  Highlights components of the matches from StashBox
// @author       KennyG
// @match        *://localhost:9999/scenes*
// @match        *://localhost:9999/groups*
// @match        *://localhost:9999/performers*
// @grant        none
// @run-at       document-end
// @icon         https://raw.githubusercontent.com/stashapp/stash/develop/ui/v2.5/public/favicon.png
// ==/UserScript==

(function () {
    'use strict';

    // Global constant for color
    const HIGHLIGHT_COLOR = '#00796B'; // Teal color

    // SVG icon shown when the date/entity is fully verified from the filename
    const VERIFIED_ICON_SVG = '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="circle-check" class="svg-inline--fa fa-circle-check fa-icon SceneTaggerIcon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" color="#0f9960"><path fill="currentColor" d="M243.8 339.8C232.9 350.7 215.1 350.7 204.2 339.8L140.2 275.8C129.3 264.9 129.3 247.1 140.2 236.2C151.1 225.3 168.9 225.3 179.8 236.2L224 280.4L332.2 172.2C343.1 161.3 360.9 161.3 371.8 172.2C382.7 183.1 382.7 200.9 371.8 211.8L243.8 339.8zM512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256zM256 48C141.1 48 48 141.1 48 256C48 370.9 141.1 464 256 464C370.9 464 464 370.9 464 256C464 141.1 370.9 48 256 48z"></path></svg>';

    // Fingerprint color rules 
    const COLOR_RULES = [
        {
            range: [0, 10],
            colors: [
                { threshold: 0.45, color: '#B71C1C' }, // Crimson
                { threshold: 0.60, color: '#FF6F00' }, // Orange800
                { threshold: 1.00, color: '#00796B' }  // Pine Green
            ]
        },
        {
            range: [11, 50],
            colors: [
                { threshold: 0.30, color: '#B71C1C' }, // Crimson
                { threshold: 0.50, color: '#FF6F00' }, // Orange800
                { threshold: 0.75, color: '#BBBE64' }, // Citron
                { threshold: 1.00, color: '#00796B' }  // Pine Green
            ]
        },
        {
            range: [51, Infinity],
            colors: [
                { threshold: 0.20, color: '#B71C1C' }, // Crimson
                { threshold: 0.40, color: '#FF6F00' }, // Orange800
                { threshold: 0.75, color: '#BBBE64' }, // Citron
                { threshold: 1.00, color: '#00796B' }  // Pine Green
            ]
        }
    ];

    function getFingerprintColor(total, percent) {
        for (let rule of COLOR_RULES) {
            if (total >= rule.range[0] && total <= rule.range[1]) {
                for (let i = 0; i < rule.colors.length; i++) {
                    if (percent <= rule.colors[i].threshold) {
                        return rule.colors[i].color;
                    }
                }
            }
        }
        return '';
    }

    // Function to check if date components (YY, MM, DD) are found in the title
    function checkDateInTitle(dateText, titleText) {
        let dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!dateMatch) return false;

        const [, year, searchMM, searchDD] = dateMatch;
        const searchYY = year.slice(2); // Get the last two digits of the year (YY)

        // Check if each component exists in the title
        const components = [searchYY, searchMM, searchDD];
        let matchCount = 0;

        components.forEach(component => {
            if (titleText.includes(component)) {
                matchCount++;
            }
        });

        return matchCount === 3; // All components must be found in the title
    }

    // Function to check for a fully verified date pattern in the title
    // e.g. dateText "2021-08-05" matches "21.08.05", "21-08-05", "21 08 05", or "210805" in the title
    function isDateVerified(dateText, titleText) {
        const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return false;

        const [, year, mm, dd] = match;
        const yy = year.slice(2);

        const patterns = [
            // YY.MM.DD, YY-MM-DD, YY MM DD
            new RegExp(`\\b${yy}[.\\- ]${mm}[.\\- ]${dd}\\b`),
            // YYYY.MM.DD, YYYY-MM-DD, YYYY MM DD
            new RegExp(`\\b${year}[.\\- ]${mm}[.\\- ]${dd}\\b`),
            // YYMMDD
            new RegExp(`\\b${yy}${mm}${dd}\\b`)
        ];

        const haystack = titleText;
        return patterns.some(re => re.test(haystack));
    }

    function highlightField(fieldObject){
        fieldObject.style.backgroundColor = HIGHLIGHT_COLOR; // Teal
        fieldObject.style.color = '#FFFFFF';
        const anchorTag = fieldObject.querySelector('a');
        if (anchorTag) {
            anchorTag.style.color = '#FFFFFF'; // Change anchor text color to white
        }
    }

    // Append a verified icon to the given field if not already present.
    // Optional tooltipText allows different explanations (date vs entity match).
    // We wrap the SVG in a small div so the hover target for the tooltip is larger
    // and easier to hit with the mouse.
    function addVerifiedIcon(fieldObject, tooltipText) {
        if (!fieldObject) return;
        // Avoid adding multiple icons
        if (fieldObject.querySelector('.SceneTaggerIcon')) {
            return;
        }

        const container = document.createElement('div');
        container.style.display = 'inline-block';
        container.style.marginLeft = '0.35rem';
        container.title = tooltipText || 'Verified match with filename';

        container.innerHTML = VERIFIED_ICON_SVG;
        fieldObject.appendChild(container);
    }

    function multiHighlight(fieldObj, targetText)
    {

        const fieldText = fieldObj.textContent.trim().toLowerCase();
        const target = targetText.trim().toLowerCase();
        const fieldWords = fieldText.split(/\s+/); //split whitespace
        let matchCount = 0;

        fieldWords.forEach(word => {
           if (target.includes(word)) {
               matchCount++;
           }
        });

        const matchPercentage = (matchCount / fieldWords.length) * 100;
        const opacity = Math.min(matchPercentage, 100); // Limit opacity to 100%

        // Apply the highlight with calculated opacity
        fieldObj.style.backgroundColor = `rgba(${parseInt(HIGHLIGHT_COLOR.slice(1, 3), 16)}, ${parseInt(HIGHLIGHT_COLOR.slice(3, 5), 16)}, ${parseInt(HIGHLIGHT_COLOR.slice(5, 7), 16)}, ${opacity / 100})`;
        fieldObj.style.color = '#FFFFFF'; // White text
    }

    // Highlight the fingerprint summary line "X / Y fingerprints" with color + %
    function highlightFingerprints() {
        const matchDivs = document.querySelectorAll('div.font-weight-bold');

        matchDivs.forEach(div => {
            const text = div.textContent || '';
            const match = text.match(/(\d+)\s*\/\s*(\d+)\s*fingerprints/i);

            if (match) {
                const matched = parseInt(match[1], 10);
                const total = parseInt(match[2], 10);

                if (total > 0) {
                    const percent = matched / total;
                    const color = getFingerprintColor(total, percent);
                    const percentText = ` (${Math.round(percent * 100)}%)`;

                    // Only append percentage if it hasn’t already been added
                    if (!text.includes(percentText)) {
                        div.textContent = text + percentText;
                    }

                    if (color) {
                        div.style.backgroundColor = color;
                        div.style.color = '#FFFFFF'; // Text white
                    }
                }
            }
        });
    }

    // Function to highlight the date/field/entity matches
    function highlightMatches() {
        let rowcount=0;
        const searchItems = document.querySelectorAll('div.search-item'); // Get all search-item divs
        searchItems.forEach(searchItem => {
            rowcount++
            // Get potential fields (optional-field-content) inside the search-item
            let resultFields = searchItem.querySelectorAll('.optional-field-content');

            // Build the "source" text from the TOP of the card only:
            // [a.scene-link.overflow-hidden] + [text-input form-control].
            // This is the query/filename we want to validate the LOWER metadata against.
            let sourceText = '';
            const sourceLink = searchItem.querySelector('a.scene-link.overflow-hidden');
            if (sourceLink && sourceLink.textContent) {
                sourceText = sourceLink.textContent.trim();
            }

            // Also include the processed query input (global text-input form-control), if present.
            // Stash normalizes this (e.g. prefixes "20" for years, dot→space, etc.),
            // so combining it with the filename text gives the full search "haystack".
            let queryText = '';
            const queryInput = document.querySelector('input.text-input.form-control, input.text-input');
            if (queryInput && typeof queryInput.value === 'string') {
                queryText = queryInput.value.trim();
            }

            if (queryText) {
                sourceText = (sourceText + ' ' + queryText).trim();
            }

            // Debug: show the source string we use as the haystack (top block only)
            //console.log('[DataMatchHighlighter] sourceText:', sourceText);

            // Loop through the date fields and find and highlight the matches
            resultFields.forEach(field => {
                let matchText = field.textContent.trim();

                //Don't process the local matches or the empty elements
               if (matchText === "" || matchText.substring(0, 8) === "Matched:") {
                   return; // Skip to the next iteration
               }

                let isoDateMatch = field.textContent.match(/^\d{4}-\d{2}-\d{2}$/); // Check for ISO date format (YYYY-MM-DD)
                if (isoDateMatch) {
                    // For dates, we ONLY compare against the top "sourceText" (filename + query).
                    // No self-match is possible because the result date lives in the lower card.
                    const hasComponents = checkDateInTitle(matchText, sourceText);
                    const verified = isDateVerified(matchText, sourceText);

                    // If we have a fully verified date pattern, skip highlight and just add the icon
                    if (verified) {
                        addVerifiedIcon(field, 'Exact date match in filename');
                    }
                    // Otherwise, keep existing "component match" highlighting behaviour
                    else if (hasComponents) {
                        highlightField(field);
                    }
                } else {
                    if (sourceText.includes(matchText))
                    {
                        // Highlight the date field in green and change the text color to white
                        highlightField(field);
                    }
                    else
                    {
                        multiHighlight(field, sourceText);
                    }
                }
            });

            // Get the entities, loop through and add verified icon when matched
            let entityFields = searchItem.querySelectorAll('.entity-name');
            entityFields.forEach(obfield => {
                // Normalize entity text and title by lowercasing and removing apostrophes
                let rawText = obfield.textContent.split(':')[1].toLowerCase().trim().replace(/'/g, "");
                let matchLabel = obfield.textContent.split(':')[0].trim();
                const normalizedTitle = sourceText.toLowerCase().replace(/'/g, "");

                // Strip any trailing "(...)" from the entity value
                let origMatch = rawText.replace(/\s*\(.*?\)\s*$/, "");

                // Candidate forms to match inside the source text:
                // "First Last"
                // "FirstLast"
                // "First.Last"
                // "First_Last"
                // "First-Last"
                const candidates = [
                    origMatch,
                    origMatch.replace(/ /g, ""),
                    origMatch.replace(/ /g, "."),
                    origMatch.replace(/ /g, "_"),
                    origMatch.replace(/ /g, "-")
                ];

                const titleNoApos = normalizedTitle;

                const hit = candidates.some(candidate => titleNoApos.includes(candidate));

                if (hit) {
                    addVerifiedIcon(obfield, `${matchLabel} found in filename`);
                }
            });
        });
    }

    // Run all highlight behaviours together
    function runAllHighlights() {
        highlightMatches();
        highlightFingerprints();
    }

    // MutationObserver to watch for DOM changes and trigger the highlight functions
    const observer = new MutationObserver(runAllHighlights);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial execution of the highlight functions when the page is loaded
    window.addEventListener('load', runAllHighlights);
})();
