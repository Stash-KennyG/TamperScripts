// ==UserScript==
// @name         Data Matches for StashResults
// @namespace    http://kennyg.com/
// @version      1.19.6.9
// @description  Highlights components of the matches from StashBox
// @author       KennyG
// @match        *://192.168.1.201:9999/scenes*
// @match        *://192.168.1.201:9999/groups*
// @match        *://192.168.1.201:9999/performers*
// @grant        none
// @run-at       document-end
// @icon         https://raw.githubusercontent.com/stashapp/stash/develop/ui/v2.5/public/favicon.png
// ==/UserScript==

(function () {
    'use strict';

    // Global constant for color
    const HIGHLIGHT_COLOR = '#00796B'; // Teal color
    const VERIFIED_MATCH_BACKGROUND_COLOR = 'rgba(0, 121, 107, 0.5)'; // Same as optional-field-content
    const NEAR_DATE_MATCH_BACKGROUND_COLOR = 'rgba(255, 111, 0, 0.75)'; // Orange: date differs by one day

    // Optional helper button near the Stash scraper toolbar.
    // When enabled, it adds a button that clicks every visible
    // "Scrape by fragment / Скрейпить по фрагменту" button on the current page.
    const ENABLE_SCRAPE_BY_FRAGMENT_ALL_BUTTON = true;
    const SCRAPE_BY_FRAGMENT_ALL_BUTTON_TEXT = 'Скрейпить все фрагменты';
    const SCRAPE_BY_FRAGMENT_BUTTON_TEXTS = [
        'Скрейпить по фрагменту',
        'Scrape by fragment'
    ];
    // Delay after finishing one fragment before starting the next scrape request.
    // This protects Stash/StashBox from rapid-fire requests during mass scraping.
    const SCRAPE_BY_FRAGMENT_CLICK_DELAY_MS = 750;
    const SCRAPE_BY_FRAGMENT_WAIT_FOR_RESULT = true;
    const SCRAPE_BY_FRAGMENT_WAIT_TIMEOUT_MS = 20000;
    const SCRAPE_BY_FRAGMENT_POLL_INTERVAL_MS = 250;

    // Persistent progress counter in the top navbar, inserted next to the
    // "New / Новый" button. It remains visible after the mass scrape stops.
    const ENABLE_SCRAPE_PROGRESS_NAVBAR_COUNTER = true;
    const SCRAPE_PROGRESS_NAVBAR_COUNTER_IDLE_TEXT = 'DMH: остановлен';

    // Optional auto-save after scraping one fragment.
    // It saves only when a scraper result has a high fingerprint ratio AND
    // at least one meaningful field match: date, studio, performer/actor, or title.
    const ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT = true;
    const AUTO_SAVE_HIGH_CONFIDENCE_FINGERPRINT_PERCENT = 0.90;
    const AUTO_SAVE_HIGH_CONFIDENCE_MIN_MATCHED_FINGERPRINTS = 8;
    // Secondary rule: slightly lower fingerprint percent is still safe when
    // several meaningful metadata fields agree. Example: 17/19 = 89.47%,
    // which is below 90%, but should be saved when title/date/performer/studio
    // also match.
    const AUTO_SAVE_STRONG_FIELDS_FINGERPRINT_PERCENT = 0.85;
    const AUTO_SAVE_STRONG_FIELDS_MIN_FIELD_MATCHES = 2;
    // Delay after selecting a candidate result before looking for/clicking Save.
    const AUTO_SAVE_CLICK_DELAY_MS = 2000;
    // Extra delay right before pressing Save and after pressing Save.
    // These pauses make automatic scraping/saving less aggressive.
    const AUTO_SAVE_BEFORE_SAVE_CLICK_DELAY_MS = 600;
    const AUTO_SAVE_AFTER_SAVE_CLICK_DELAY_MS = 900;
    // After StashBox returns scraper results, React can still render metadata fields
    // and the per-result Save button a little later. Retry auto-save briefly before
    // writing the file name to session memory as "no automatic match".
    const AUTO_SAVE_CANDIDATE_RETRY_TIMEOUT_MS = 5000;
    const AUTO_SAVE_CANDIDATE_RETRY_INTERVAL_MS = 2000;
    const AUTO_SAVE_SAVE_BUTTON_WAIT_TIMEOUT_MS = 3000;
    const AUTO_SAVE_SAVE_BUTTON_WAIT_INTERVAL_MS = 2000;
    const AUTO_SAVE_BUTTON_TEXTS = [
        'Сохранить',
        'Save'
    ];

    // Session-only memory for files that were already scraped during this browser
    // session but did not produce an automatic high-confidence save. This avoids
    // repeating expensive "Scrape by fragment" requests when pressing the mass
    // scrape button again. The memory is kept in sessionStorage, so it is cleared
    // when the browser/tab session is closed.
    const ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH = true;
    const SCRAPE_SESSION_MEMORY_KEY = 'DataMatchesForStashResults.noAutoMatchFilenames.v3';

    // Optional button near the mass scrape button that clears the session-only
    // "no automatic match" memory. Use it when you want the next mass scrape
    // run to retry files that were previously skipped during the current session.
    const ENABLE_CLEAR_SCRAPE_SESSION_MEMORY_BUTTON = true;
    const CLEAR_SCRAPE_SESSION_MEMORY_BUTTON_TEXT = 'Очистить память';


    // Alias groups for filename/query-to-entity matching.
    // Add new aliases as additional values in the same group.
    // Example: filename token "t4k" should match entity/studio "Tiny 4K".
    const MATCH_ALIAS_GROUPS = [
        ['t4k', 'Tiny 4K'],
		['tla', 'Teens Love Anal'],
		['18OG', '18 Only Girls']
    ];

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

    // Function to check if date components (YY, MM, DD) are found in the title.
    // Keep the old partial-match behavior from 1.19, but do NOT match date parts
    // inside unrelated longer numbers. For example, 2014-10-14 must not match
    // filename/query "21.08.14_1080" just because "10" exists inside "1080".
    function checkDateInTitle(dateText, titleText) {
        const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!dateMatch) return false;

        const [, year, searchMM, searchDD] = dateMatch;
        const searchYY = year.slice(2); // Get the last two digits of the year (YY)
        const components = [searchYY, searchMM, searchDD];

        // Extract numeric tokens from the filename/query. This makes "10" match
        // only a standalone numeric token "10", not the first two digits of "1080".
        const numberTokens = (titleText.match(/\d+/g) || []).slice();
        if (numberTokens.length === 0) return false;

        // Consume tokens one by one so repeated components, e.g. 14-10-14,
        // require enough real occurrences in the filename/query.
        return components.every(component => {
            const index = numberTokens.findIndex(token => token === component);
            if (index === -1) return false;
            numberTokens.splice(index, 1);
            return true;
        });
    }

    // Check for year-only partial date match from filenames like:
    // "Dakota Tyler - [Tiny4K.com] - [2022] - Tiny Temptation.mp4".
    // The bracketed year is treated as a real production/release year and can
    // partially match result dates such as "2022-05-17". This intentionally
    // requires square/round brackets so random numbers in filenames do not
    // become date evidence.
    function isYearPartiallyMatched(dateText, titleText) {
        const dateMatch = dateText.match(/^(\d{4})-\d{2}-\d{2}$/);
        if (!dateMatch) return false;

        const year = dateMatch[1];
        const escapedYear = year.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const bracketedYearPattern = new RegExp(`[\\[\\(]\\s*${escapedYear}\\s*[\\]\\)]`);

        return bracketedYearPattern.test(titleText || '');
    }



    function makeUtcDayNumber(year, month, day) {
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
        if (y < 1900 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;

        const date = new Date(Date.UTC(y, m - 1, d));
        if (
            date.getUTCFullYear() !== y ||
            date.getUTCMonth() !== m - 1 ||
            date.getUTCDate() !== d
        ) {
            return null;
        }

        return Math.floor(date.getTime() / 86400000);
    }

    function parseIsoDateToUtcDay(dateText) {
        const match = (dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return makeUtcDayNumber(match[1], match[2], match[3]);
    }

    function expandTwoDigitYear(twoDigitYear) {
        const yy = Number(twoDigitYear);
        if (!Number.isInteger(yy)) return null;
        return yy >= 70 ? 1900 + yy : 2000 + yy;
    }

    function addSourceDateCandidate(candidates, year, month, day) {
        const dayNumber = makeUtcDayNumber(year, month, day);
        if (dayNumber === null) return;
        candidates.push(dayNumber);
    }

    function getSourceDateCandidates(sourceText) {
        const haystack = sourceText || '';
        const candidates = [];
        const seenKeys = new Set();

        function addUnique(year, month, day) {
            const key = `${year}-${month}-${day}`;
            if (seenKeys.has(key)) return;
            seenKeys.add(key);
            addSourceDateCandidate(candidates, year, month, day);
        }

        // YYYY.MM.DD / YYYY-MM-DD / YYYY MM DD
        haystack.replace(/(^|\D)(\d{4})[.\- ](\d{2})[.\- ](\d{2})(?=\D|$)/g, (full, prefix, year, mm, dd) => {
            addUnique(year, mm, dd);
            return full;
        });

        // YY.MM.DD / YY-MM-DD / YY MM DD, e.g. pervmom.18.03.10 -> 2018-03-10
        haystack.replace(/(^|\D)(\d{2})[.\- ](\d{2})[.\- ](\d{2})(?=\D|$)/g, (full, prefix, yy, mm, dd) => {
            const year = expandTwoDigitYear(yy);
            if (year !== null) addUnique(year, mm, dd);
            return full;
        });

        // DD.MM.YYYY / DD-MM-YYYY / DD MM YYYY
        haystack.replace(/(^|\D)(\d{2})[.\- ](\d{2})[.\- ](\d{4})(?=\D|$)/g, (full, prefix, dd, mm, year) => {
            addUnique(year, mm, dd);
            return full;
        });

        // Compact YYMMDD, e.g. 180310
        haystack.replace(/(^|\D)(\d{6})(?=\D|$)/g, (full, prefix, compact) => {
            const yy = compact.slice(0, 2);
            const mm = compact.slice(2, 4);
            const dd = compact.slice(4, 6);
            const year = expandTwoDigitYear(yy);
            if (year !== null) addUnique(year, mm, dd);
            return full;
        });

        // Compact YYYYMMDD and DDMMYYYY. Both are attempted and invalid dates are ignored.
        haystack.replace(/(^|\D)(\d{8})(?=\D|$)/g, (full, prefix, compact) => {
            addUnique(compact.slice(0, 4), compact.slice(4, 6), compact.slice(6, 8));
            addUnique(compact.slice(4, 8), compact.slice(2, 4), compact.slice(0, 2));
            return full;
        });

        return candidates;
    }

    function isDateWithinOneDay(dateText, sourceText) {
        const resultDay = parseIsoDateToUtcDay(dateText);
        if (resultDay === null) return false;

        return getSourceDateCandidates(sourceText).some(sourceDay =>
            Math.abs(resultDay - sourceDay) === 1
        );
    }

    function getDateMatchStatus(dateText, sourceText) {
        if (isDateVerified(dateText, sourceText)) return 'exact';
        if (isDateWithinOneDay(dateText, sourceText)) return 'near';
        if (checkDateInTitle(dateText, sourceText)) return 'partial';
        if (isYearPartiallyMatched(dateText, sourceText)) return 'year';
        return 'none';
    }

    // Function to check for a fully verified date pattern in the title.
    // e.g. dateText "2021-08-05" matches:
    // - "21.08.05", "21-08-05", "21 08 05", or "210805"
    // - "2021.08.05", "2021-08-05", or "2021 08 05"
    // - European filename dates like "05.08.2021", "05-08-2021", or "05 08 2021"
    function isDateVerified(dateText, titleText) {
        const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return false;

        const [, year, mm, dd] = match;
        const yy = year.slice(2);

        // Allow common delimiters between parts, and don't require strict \b at the left,
        // because filenames often have an underscore or letter before the year.
        const patterns = [
            // YY.MM.DD, YY-MM-DD, YY MM DD
            new RegExp(`${yy}[.\\- ]${mm}[.\\- ]${dd}`),
            // YYYY.MM.DD, YYYY-MM-DD, YYYY MM DD
            new RegExp(`${year}[.\\- ]${mm}[.\\- ]${dd}`),
            // DD.MM.YYYY, DD-MM-YYYY, DD MM YYYY
            new RegExp(`${dd}[.\\- ]${mm}[.\\- ]${year}`),
            // YYMMDD
            new RegExp(`${yy}${mm}${dd}`),
            // DDMMYYYY
            new RegExp(`${dd}${mm}${year}`)
        ];

        const haystack = titleText || '';
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

    // Highlight fields that were verified from the filename.
    // Uses the same visible style as Stash's "optional-field-content" matched block.
    function highlightVerifiedMatch(fieldObject) {
        if (!fieldObject) return;

        fieldObject.style.backgroundColor = VERIFIED_MATCH_BACKGROUND_COLOR;
        fieldObject.style.color = '#FFFFFF';
        fieldObject.style.borderRadius = '0.25rem';
        fieldObject.style.padding = '0.15rem 0.35rem';

        fieldObject.querySelectorAll('a').forEach(anchorTag => {
            anchorTag.style.color = '#FFFFFF';
        });
    }


    function highlightNearDateMatch(fieldObject) {
        if (!fieldObject) return;

        fieldObject.style.backgroundColor = NEAR_DATE_MATCH_BACKGROUND_COLOR;
        fieldObject.style.color = '#FFFFFF';
        fieldObject.style.borderRadius = '0.25rem';
        fieldObject.style.padding = '0.15rem 0.35rem';
        fieldObject.title = 'Date is within 1 day of filename date';

        fieldObject.querySelectorAll('a').forEach(anchorTag => {
            anchorTag.style.color = '#FFFFFF';
        });
    }

    function highlightDateFieldByStatus(fieldObject, matchStatus) {
        if (matchStatus === 'exact') {
            highlightVerifiedMatch(fieldObject);
            addVerifiedIcon(fieldObject, 'Exact date match in filename');
        } else if (matchStatus === 'near') {
            highlightNearDateMatch(fieldObject);
        } else if (matchStatus === 'partial' || matchStatus === 'year') {
            highlightField(fieldObject);
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

    function applyVerifiedSpanStyle(span) {
        span.style.backgroundColor = VERIFIED_MATCH_BACKGROUND_COLOR;
        span.style.color = '#FFFFFF';
        span.style.borderRadius = '0.25rem';
        span.style.padding = '0.15rem 0.35rem';
        span.style.display = 'inline-block';
    }


    function applyNearDateSpanStyle(span) {
        span.style.backgroundColor = NEAR_DATE_MATCH_BACKGROUND_COLOR;
        span.style.color = '#FFFFFF';
        span.style.borderRadius = '0.25rem';
        span.style.padding = '0.15rem 0.35rem';
        span.style.display = 'inline-block';
    }

    function applyDateSpanStyle(span, matchStatus) {
        if (matchStatus === 'exact' || matchStatus === 'partial' || matchStatus === 'year') {
            applyVerifiedSpanStyle(span);
        } else if (matchStatus === 'near') {
            applyNearDateSpanStyle(span);
        }
    }

    function createTextSpan(text, isMatched, tooltipText, matchStatus) {
        const span = document.createElement('span');
        span.textContent = text;
        if (isMatched) {
            if (matchStatus) {
                applyDateSpanStyle(span, matchStatus);
            } else {
                applyVerifiedSpanStyle(span);
            }
            if (tooltipText) {
                span.title = tooltipText;
            }
        }
        return span;
    }

    function getSceneMetadataParts(text) {
        const dateMatch = (text || '').match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (!dateMatch) {
            return {
                textPart: (text || '').trim(),
                separatorPart: '',
                datePart: ''
            };
        }

        const datePart = dateMatch[0];
        const beforeDate = text.slice(0, dateMatch.index);
        const afterDate = text.slice(dateMatch.index + datePart.length);

        // The usual form is "Studio • YYYY-MM-DD". Keep the separator unhighlighted
        // so studio/site and date can show independent match states.
        const separatorMatch = beforeDate.match(/\s*[•|\-–—]\s*$/);
        const separatorPart = separatorMatch ? separatorMatch[0] : '';
        const textPart = beforeDate.slice(0, beforeDate.length - separatorPart.length).trim();

        return {
            textPart,
            separatorPart,
            datePart,
            afterDate
        };
    }

    function clearSceneMetadataContainerHighlight(field) {
        // Older versions highlighted the whole h5. Newer versions highlight only
        // the matched sub-parts, so clear our old container-level inline style.
        field.style.backgroundColor = '';
        field.style.color = '';
        field.style.borderRadius = '';
        field.style.padding = '';
    }

    // Highlight metadata rendered as a compact header, for example:
    // <div class="scene-metadata"><h5>Tiny 4K • 2014-10-14</h5></div>
    // Studio/site text and date are evaluated independently. This prevents a line
    // like "Tiny 4K • 2014-10-14" from being highlighted as one whole block when
    // only the alias "t4k" matches the filename/query.
    function highlightSceneMetadataDates(searchItem, sourceText) {
        const metadataFields = searchItem.querySelectorAll('.scene-metadata h5');

        metadataFields.forEach(field => {
            clearSceneMetadataContainerHighlight(field);

            // If Stash rendered a real optional-field inside h5, leave that component
            // alone. It is already handled by the optional-field-content code path.
            if (field.querySelector('.optional-field')) return;

            if (!field.dataset.dmhOriginalText) {
                field.dataset.dmhOriginalText = field.textContent || '';
            }

            const originalText = field.dataset.dmhOriginalText;
            const parts = getSceneMetadataParts(originalText);
            const textMatched = !!parts.textPart && isTextMatchedBySource(parts.textPart, sourceText);
            const dateMatchStatus = parts.datePart ? getDateMatchStatus(parts.datePart, sourceText) : 'none';
            const dateMatched = dateMatchStatus !== 'none';

            const signature = [originalText, sourceText, textMatched ? 'T1' : 'T0', `D:${dateMatchStatus}`].join('::');
            if (field.dataset.dmhSceneMetadataSignature === signature) return;
            field.dataset.dmhSceneMetadataSignature = signature;

            field.textContent = '';

            if (parts.textPart) {
                field.appendChild(createTextSpan(
                    parts.textPart,
                    textMatched,
                    textMatched ? 'Text/studio found in filename or alias dictionary' : ''
                ));
            }

            if (parts.separatorPart) {
                field.appendChild(document.createTextNode(parts.separatorPart));
            } else if (parts.textPart && parts.datePart) {
                field.appendChild(document.createTextNode(' '));
            }

            if (parts.datePart) {
                const dateSpan = createTextSpan(
                    parts.datePart,
                    dateMatched,
                    dateMatchStatus === 'near'
                        ? 'Date is within 1 day of filename date'
                        : (dateMatched ? 'Date match in filename' : ''),
                    dateMatchStatus
                );
                field.appendChild(dateSpan);
            }

            if (parts.afterDate) {
                field.appendChild(document.createTextNode(parts.afterDate));
            }
        });
    }

    // Highlight fingerprint ratio lines by generic "X/Y" pattern only.
    // This is language-independent and does not rewrite DOM/text nodes,
    // so it is safe to run from MutationObserver without causing update loops.
    function highlightFingerprints() {
        const matchDivs = document.querySelectorAll('div.font-weight-bold');

        matchDivs.forEach(div => {
            const text = div.textContent || '';
            const match = text.match(/(\d+)\s*\/\s*(\d+)/);
            if (!match) return;

            const matched = parseInt(match[1], 10);
            const total = parseInt(match[2], 10);
            if (!Number.isFinite(matched) || !Number.isFinite(total) || total <= 0) return;

            const percent = matched / total;
            const color = getFingerprintColor(total, percent);
            if (!color) return;

            div.style.backgroundColor = color;
            div.style.color = '#FFFFFF';
            div.style.borderRadius = '0.25rem';
            div.style.padding = '0.15rem 0.35rem';
        });
    }


    // Normalize text for lightweight filename/entity comparisons.
    function normalizeForCompare(value) {
        return (value || '')
            .toLowerCase()
            .replace(/'/g, '')
            .trim();
    }

    // Stronger normalization for comparing StashBox entity names with local Stash
    // matched names. This ignores punctuation like !, dots, hyphens, underscores
    // and multiple spaces, so "Not My Grandpa!" and "Not My Grandpa" match.
    function normalizeForLooseCompare(value) {
        return normalizeForCompare(value)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function getAliasGroupValues(value) {
        const valueLoose = normalizeForLooseCompare(value);
        if (!valueLoose) return [];

        const aliases = new Set();
        MATCH_ALIAS_GROUPS.forEach(group => {
            const groupLooseValues = group.map(item => normalizeForLooseCompare(item)).filter(Boolean);
            if (groupLooseValues.includes(valueLoose)) {
                group.forEach(item => {
                    if (item) aliases.add(item);
                });
            }
        });

        return Array.from(aliases);
    }

    function buildTextMatchCandidates(value) {
        const normalizedValue = normalizeForCompare(value);
        const values = [normalizedValue, ...getAliasGroupValues(normalizedValue)];
        const candidates = new Set();

        values.forEach(item => {
            const normalizedItem = normalizeForCompare(item);
            const looseItem = normalizeForLooseCompare(item);
            if (!normalizedItem && !looseItem) return;

            if (normalizedItem) {
                candidates.add(normalizedItem);
                candidates.add(normalizedItem.replace(/\s+/g, ''));
                candidates.add(normalizedItem.replace(/\s+/g, '.'));
                candidates.add(normalizedItem.replace(/\s+/g, '_'));
                candidates.add(normalizedItem.replace(/\s+/g, '-'));
            }

            if (looseItem) {
                candidates.add(looseItem);
            }
        });

        return Array.from(candidates).filter(Boolean);
    }

    function areNamesEquivalent(left, right) {
        const leftLoose = normalizeForLooseCompare(left);
        const rightLoose = normalizeForLooseCompare(right);
        return !!leftLoose && !!rightLoose && leftLoose === rightLoose;
    }

    function isTextMatchedBySource(value, sourceText) {
        const normalizedSource = normalizeForCompare(sourceText);
        if (!value || !normalizedSource) return false;

        const candidates = buildTextMatchCandidates(value);
        if (candidates.length === 0) return false;

        const looseSource = normalizeForLooseCompare(normalizedSource);
        return candidates.some(candidate =>
            candidate && (normalizedSource.includes(candidate) || looseSource.includes(candidate))
        );
    }

    function getEntityFieldValue(field) {
        if (!field) return '';

        const anchor = field.querySelector('b a, b span a, a');
        const anchorText = anchor && anchor.textContent ? anchor.textContent.trim() : '';
        if (anchorText) {
            return anchorText.replace(/\s*\(.*?\)\s*$/, '').trim();
        }

        const parts = (field.textContent || '').split(':');
        if (parts.length < 2) return '';

        return parts.slice(1).join(':').replace(/\s*\(.*?\)\s*$/, '').trim();
    }

    function getEntityMatchLabel(field) {
        const text = field && field.textContent ? field.textContent : '';
        return text.includes(':') ? text.split(':')[0].trim() : 'Entity';
    }

    function isLocalMatchedText(value) {
        return /^\s*(Matched|Совпавший)\s*:/i.test(value || '');
    }

    function getBackgroundAlpha(element) {
        if (!element) return 0;

        const backgroundColor = (
            element.style.backgroundColor ||
            window.getComputedStyle(element).backgroundColor ||
            ''
        ).trim().toLowerCase();

        if (!backgroundColor || backgroundColor === 'transparent') return 0;

        const rgbaMatch = backgroundColor.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        if (rgbaMatch) {
            const alpha = parseFloat(rgbaMatch[1]);
            return Number.isFinite(alpha) ? alpha : 0;
        }

        const rgbMatch = backgroundColor.match(/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/);
        return rgbMatch ? 1 : 0;
    }

    function isVisiblyHighlightedField(element) {
        // Treat rgba(..., 0) as NOT highlighted. This prevents local "Совпавший"
        // blocks with transparent background from verifying the entity name.
        return getBackgroundAlpha(element) > 0.05;
    }

    function getLocalMatchedValuesNearEntity(field) {
        const row = field.closest('.row');
        const scope = row || field.closest('li.search-result') || field.parentElement;
        if (!scope) return [];

        return Array.from(scope.querySelectorAll('.optional-field.included .optional-field-content'))
            .filter(optionalField => !optionalField.closest('.scene-image-container'))
            .filter(optionalField => isVisiblyHighlightedField(optionalField))
            .map(optionalField => {
                const anchor = optionalField.querySelector('a');
                if (anchor && anchor.textContent) {
                    return anchor.textContent.trim();
                }

                return (optionalField.textContent || '')
                    .replace(/^\s*(Matched|Совпавший)\s*:\s*/i, '')
                    .trim();
            })
            .filter(Boolean);
    }

    function isEntityMatchedLocally(field, entityValue) {
        if (!entityValue) return false;

        return getLocalMatchedValuesNearEntity(field).some(localValue =>
            areNamesEquivalent(entityValue, localValue)
        );
    }

    function countEntityMatches(result, sourceText) {
        let score = 0;

        result.querySelectorAll('.entity-name').forEach(field => {
            const entityValue = getEntityFieldValue(field);
            if (!entityValue) return;

            if (isTextMatchedBySource(entityValue, sourceText)) {
                score += 2;
            }

            // Local Stash match is also a strong signal. It covers cases where the
            // filename does not contain the studio/performer name, but Stash already
            // rendered "Matched/Совпавший" with the same name next to the entity.
            if (isEntityMatchedLocally(field, entityValue)) {
                score += 2;
            }
        });

        return score;
    }

    function countOptionalFieldMatches(result, sourceText) {
        let score = 0;

        result.querySelectorAll('.optional-field.included .optional-field-content').forEach(field => {
            // The preview image is usually present in every result, so it is not useful
            // for deciding which metadata tab/result is the best match.
            if (field.closest('.scene-image-container')) return;

            const value = (field.textContent || '').trim();
            if (!value) return;

            if (isLocalMatchedText(value)) {
                // A local Stash match should influence scoring only when it is visibly
                // highlighted by Stash/our previous checks. Transparent rgba(..., 0)
                // means there was no real filename/query match.
                if (isVisiblyHighlightedField(field)) {
                    score += 1;
                }
                return;
            }

            const isoDateMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
            if (isoDateMatch) {
                const dateMatchStatus = getDateMatchStatus(value, sourceText);
                if (dateMatchStatus === 'exact') {
                    score += 3;
                } else if (dateMatchStatus === 'near') {
                    score += 2.5;
                } else if (dateMatchStatus === 'partial') {
                    score += 2;
                } else if (dateMatchStatus === 'year') {
                    score += 1.5;
                } else {
                    score += 1;
                }
                return;
            }

            if (isTextMatchedBySource(value, sourceText)) {
                score += 2;
                return;
            }

            // Stash's included optional-field still means the scraper selected this field.
            // Give it a small score even if it is not directly found in the filename.
            score += 1;
        });

        return score;
    }

    function countSceneMetadataDateMatches(result, sourceText) {
        let score = 0;

        result.querySelectorAll('.scene-metadata h5').forEach(field => {
            const text = field.dataset.dmhOriginalText || field.textContent || '';
            const parts = getSceneMetadataParts(text);

            if (parts.textPart && isTextMatchedBySource(parts.textPart, sourceText)) {
                score += 2;
            }

            if (parts.datePart) {
                const dateMatchStatus = getDateMatchStatus(parts.datePart, sourceText);
                if (dateMatchStatus === 'exact') {
                    score += 3;
                } else if (dateMatchStatus === 'near') {
                    score += 2.5;
                } else if (dateMatchStatus === 'partial') {
                    score += 2;
                } else if (dateMatchStatus === 'year') {
                    score += 1.5;
                }
            }
        });

        return score;
    }

    function countFingerprintAndChecksumMatches(result) {
        let score = 0;

        result.querySelectorAll('div.font-weight-bold').forEach(div => {
            const text = div.textContent || '';
            const ratioMatch = text.match(/(\d+)\s*\/\s*(\d+)/);

            if (ratioMatch) {
                const matched = parseInt(ratioMatch[1], 10);
                const total = parseInt(ratioMatch[2], 10);

                if (Number.isFinite(matched) && Number.isFinite(total) && total > 0) {
                    const percent = Math.max(0, Math.min(1, matched / total));
                    // Ratio is the strongest single indicator, but keep the score bounded.
                    score += percent * 6;
                    score += Math.min(matched, 100) / 100;
                    if (matched === total) score += 1;
                }
                return;
            }

            const hasSuccessIcon = div.querySelector('.SceneTaggerIcon.text-success, .text-success, svg[color="#0f9960"]');
            const hasDangerIcon = div.querySelector('.text-danger, [data-icon="xmark"]');

            if (hasSuccessIcon) score += 1.5;
            if (hasDangerIcon) score -= 1;
        });

        return score;
    }

    function getSearchResultScore(result, sourceText) {
        let score = 0;

        score += countOptionalFieldMatches(result, sourceText);
        score += countEntityMatches(result, sourceText);
        score += countSceneMetadataDateMatches(result, sourceText);
        score += countFingerprintAndChecksumMatches(result);

        return score;
    }

    function getResultActivationSignature(searchResults) {
        return searchResults.map(result => result.className).join('|');
    }

    // Select/expand the best search-result inside each search-item.
    // We click the best result instead of moving DOM nodes, because Stash/React owns the list.
    function activateBestSearchResult(searchItem, sourceText) {
        const searchResults = Array.from(searchItem.querySelectorAll('li.search-result'));
        if (searchResults.length < 2) return;

        const scored = searchResults.map((result, index) => ({
            result,
            index,
            score: getSearchResultScore(result, sourceText)
        }));

        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.index - b.index;
        });

        const best = scored[0];
        if (!best || best.score <= 0) return;

        const currentlyActive = searchResults.find(result =>
            result.classList.contains('active') || result.classList.contains('selected-result')
        );

        if (currentlyActive === best.result) return;

        const scoreSignature = scored
            .map(item => `${item.index}:${Math.round(item.score * 100)}`)
            .join('|');
        const activationSignature = getResultActivationSignature(searchResults);
        const signature = `${scoreSignature}::${activationSignature}`;
        const now = Date.now();
        const lastSignature = searchItem.dataset.dmhBestResultActivationSignature || '';
        const lastClickTime = parseInt(searchItem.dataset.dmhBestResultActivationTime || '0', 10);

        // If Stash does not activate the result for some reason, do not click in a tight loop.
        if (lastSignature === signature && now - lastClickTime < 1500) return;

        searchItem.dataset.dmhBestResultActivationSignature = signature;
        searchItem.dataset.dmhBestResultActivationTime = String(now);

        best.result.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    }

    function getSearchItemSourceText(searchItem) {
        if (!searchItem) return '';

        let sourceText = '';
        const sourceLink = searchItem.querySelector('a.scene-link.overflow-hidden');
        if (sourceLink && sourceLink.textContent) {
            sourceText = sourceLink.textContent.trim();
        }

        const queryInput = searchItem.querySelector('input.text-input.form-control, input.text-input');
        if (queryInput && typeof queryInput.value === 'string') {
            const queryText = queryInput.value.trim();
            if (queryText) {
                sourceText = (sourceText + ' ' + queryText).trim();
            }
        }

        return sourceText;
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
            const sourceText = getSearchItemSourceText(searchItem);

            // Debug: show the source string we use as the haystack (top block only)
            //console.log('[DataMatchHighlighter] sourceText:', sourceText);

            // Loop through the date fields and find and highlight the matches
            resultFields.forEach(field => {
                let matchText = field.textContent.trim();

                // Don't process local Stash matched blocks or empty elements.
                // These blocks look like "Matched:" / "Совпавший:" and should not be
                // colored by partial filename matching, especially not with rgba(..., 0).
                if (matchText === "" || isLocalMatchedText(matchText)) {
                    return; // Skip to the next iteration
                }

                let isoDateMatch = field.textContent.match(/^\d{4}-\d{2}-\d{2}$/); // Check for ISO date format (YYYY-MM-DD)
                if (isoDateMatch) {
                    // For dates, we ONLY compare against the top "sourceText" (filename + query).
                    // No self-match is possible because the result date lives in the lower card.
                    // Exact matches are green; +/- 1 day matches are orange; weaker partial/year
                    // matches keep the old green behaviour from 1.19.x.
                    const dateMatchStatus = getDateMatchStatus(matchText, sourceText);
                    highlightDateFieldByStatus(field, dateMatchStatus);
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

            // Also handle dates that Stash renders inside scene metadata headers.
            highlightSceneMetadataDates(searchItem, sourceText);

            // Get the entities, loop through and add verified icon when matched.
            // An entity can be verified either from filename/query OR from the local
            // "Matched/Совпавший" optional field rendered in the same row.
            let entityFields = searchItem.querySelectorAll('.entity-name');
            entityFields.forEach(obfield => {
                const entityValue = getEntityFieldValue(obfield);
                if (!entityValue) return;

                const matchLabel = getEntityMatchLabel(obfield);
                const matchedBySource = isTextMatchedBySource(entityValue, sourceText);
                const matchedLocally = isEntityMatchedLocally(obfield, entityValue);

                if (matchedBySource || matchedLocally) {
                    highlightVerifiedMatch(obfield);
                    addVerifiedIcon(
                        obfield,
                        matchedBySource
                            ? `${matchLabel} found in filename`
                            : `${matchLabel} matches local Stash item`
                    );
                }
            });

            // If several scraper result tabs are present, open the one with the strongest match score.
            activateBestSearchResult(searchItem, sourceText);
        });
    }

    function isElementVisible(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function isScrapeByFragmentButton(button) {
        if (!button || button.dataset.dmhScrapeAllButton === 'true') return false;
        const buttonText = (button.textContent || '').replace(/\s+/g, ' ').trim();
        return SCRAPE_BY_FRAGMENT_BUTTON_TEXTS.some(expectedText => buttonText === expectedText);
    }

    function getScrapeByFragmentButtons() {
        return Array.from(document.querySelectorAll('button.btn.btn-primary'))
            .filter(isScrapeByFragmentButton)
            .filter(button => !button.disabled)
            .filter(isElementVisible);
    }

    function getCurrentScrapeButtonForSearchItem(searchItem, fallbackButton) {
        if (fallbackButton && document.body.contains(fallbackButton)) {
            return fallbackButton;
        }

        if (!searchItem || !document.body.contains(searchItem)) return null;

        return Array.from(searchItem.querySelectorAll('button.btn.btn-primary'))
            .find(isScrapeByFragmentButton) || null;
    }

    function getSearchItemFileName(searchItem) {
        if (!searchItem) return '';

        const fileNameElement = searchItem.querySelector(
            'a.scene-link.overflow-hidden .TruncatedText, a.scene-link.overflow-hidden'
        );

        return (fileNameElement ? fileNameElement.textContent : '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeSessionMemoryFileName(fileName) {
        return (fileName || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function readNoAutoMatchMemorySet() {
        if (!ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH) return new Set();

        try {
            const raw = window.sessionStorage.getItem(SCRAPE_SESSION_MEMORY_KEY);
            const values = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(values)) return new Set();
            return new Set(values.filter(value => typeof value === 'string' && value.length > 0));
        } catch (error) {
            console.warn('[DataMatchHighlighter] Failed to read scrape session memory:', error);
            return new Set();
        }
    }

    function writeNoAutoMatchMemorySet(memorySet) {
        if (!ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH) return;

        try {
            window.sessionStorage.setItem(
                SCRAPE_SESSION_MEMORY_KEY,
                JSON.stringify(Array.from(memorySet).sort())
            );
        } catch (error) {
            console.warn('[DataMatchHighlighter] Failed to write scrape session memory:', error);
        }
    }

    function clearNoAutoMatchMemorySet() {
        if (!ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH) return 0;

        const previousSize = readNoAutoMatchMemorySet().size;

        try {
            window.sessionStorage.removeItem(SCRAPE_SESSION_MEMORY_KEY);
        } catch (error) {
            console.warn('[DataMatchHighlighter] Failed to clear scrape session memory:', error);
        }

        document.querySelectorAll('[data-dmh-scrape-no-auto-match-file]').forEach(searchItem => {
            delete searchItem.dataset.dmhScrapeNoAutoMatchReason;
            delete searchItem.dataset.dmhScrapeNoAutoMatchFile;
        });

        return previousSize;
    }

    function isSearchItemRememberedAsNoAutoMatch(searchItem) {
        if (!ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH) return false;

        const fileNameKey = normalizeSessionMemoryFileName(getSearchItemFileName(searchItem));
        if (!fileNameKey) return false;

        return readNoAutoMatchMemorySet().has(fileNameKey);
    }

    function rememberSearchItemAsNoAutoMatch(searchItem, reason) {
        if (!ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH || !searchItem) return false;

        const fileName = getSearchItemFileName(searchItem);
        const fileNameKey = normalizeSessionMemoryFileName(fileName);
        if (!fileNameKey) return false;

        const memorySet = readNoAutoMatchMemorySet();
        if (memorySet.has(fileNameKey)) return false;

        memorySet.add(fileNameKey);
        writeNoAutoMatchMemorySet(memorySet);

        searchItem.dataset.dmhScrapeNoAutoMatchRemembered = 'true';
        searchItem.dataset.dmhScrapeNoAutoMatchReason = reason || 'no-auto-save';
        searchItem.dataset.dmhScrapeNoAutoMatchFile = fileName;

        return true;
    }

    function getComparisonDataSignature(searchItem) {
        if (!searchItem) return '';

        const resultCount = searchItem.querySelectorAll('li.search-result').length;
        const relevantText = Array.from(searchItem.querySelectorAll(
            'li.search-result .scene-metadata, li.search-result .optional-field-content, li.search-result .entity-name, li.search-result div.font-weight-bold'
        ))
            .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join(' || ')
            .slice(0, 10000);

        return `${resultCount}::${relevantText}`;
    }

    function hasComparisonData(searchItem) {
        if (!searchItem) return false;

        return Array.from(searchItem.querySelectorAll('li.search-result')).some(result => {
            if (result.querySelector('.entity-name')) return true;
            if (result.querySelector('.scene-metadata')) return true;

            const hasUsefulOptionalText = Array.from(result.querySelectorAll('.optional-field-content'))
                .some(field => {
                    if (field.closest('.scene-image-container')) return false;
                    const text = (field.textContent || '').replace(/\s+/g, ' ').trim();
                    return text.length > 0;
                });
            if (hasUsefulOptionalText) return true;

            return Array.from(result.querySelectorAll('div.font-weight-bold'))
                .some(div => /\d+\s*\/\s*\d+|PHash|MD5|ПХэш|ПHash|Checksum|контрольн/i.test(div.textContent || ''));
        });
    }


    function hasNoScrapeResults(searchItem) {
        if (!searchItem) return false;

        return Array.from(searchItem.querySelectorAll('.text-danger.font-weight-bold, .text-danger'))
            .some(element => {
                const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                return /ничего\s+не\s+найдено|nothing\s+found|no\s+results/i.test(text);
            });
    }

    function getBestFingerprintInfo(result) {
        let best = null;

        if (!result) return null;

        result.querySelectorAll('div.font-weight-bold').forEach(div => {
            const text = div.textContent || '';
            const ratioMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
            if (!ratioMatch) return;

            const matched = parseInt(ratioMatch[1], 10);
            const total = parseInt(ratioMatch[2], 10);
            if (!Number.isFinite(matched) || !Number.isFinite(total) || total <= 0) return;

            const percent = Math.max(0, Math.min(1, matched / total));
            const info = { matched, total, percent, exact: matched === total };
            if (!best || info.percent > best.percent || (info.percent === best.percent && info.matched > best.matched)) {
                best = info;
            }
        });

        return best;
    }

    function isStudioOrActorEntityField(field) {
        const label = normalizeForCompare(getEntityMatchLabel(field));
        return /студ|studio|акт[её]р|actor|performer/.test(label);
    }

    function getHighConfidenceFieldMatches(result, sourceText) {
        const matches = new Set();
        if (!result) return matches;

        result.querySelectorAll('.entity-name').forEach(field => {
            if (!isStudioOrActorEntityField(field)) return;

            const entityValue = getEntityFieldValue(field);
            if (!entityValue) return;

            const label = normalizeForCompare(getEntityMatchLabel(field));
            const isActor = /акт[её]р|actor|performer/.test(label);
            const isStudio = /студ|studio/.test(label);

            if (isTextMatchedBySource(entityValue, sourceText) || isEntityMatchedLocally(field, entityValue)) {
                if (isActor) matches.add('actor');
                if (isStudio) matches.add('studio');
            }
        });

        result.querySelectorAll('.optional-field.included .optional-field-content').forEach(field => {
            if (field.closest('.scene-image-container')) return;

            const value = (field.textContent || '').replace(/\s+/g, ' ').trim();
            if (!value || isLocalMatchedText(value)) return;

            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const dateMatchStatus = getDateMatchStatus(value, sourceText);
                if (dateMatchStatus !== 'none') matches.add('date');
                return;
            }

            const isPotentialTitleField = !!field.closest('.scene-metadata h4, .scene-metadata h5');
            if (isPotentialTitleField && isTextMatchedBySource(value, sourceText)) {
                matches.add('title');
            }
        });

        result.querySelectorAll('.scene-metadata h5').forEach(field => {
            const text = field.dataset.dmhOriginalText || field.textContent || '';
            const parts = getSceneMetadataParts(text);

            if (parts.datePart && getDateMatchStatus(parts.datePart, sourceText) !== 'none') {
                matches.add('date');
            }

            if (parts.textPart && isTextMatchedBySource(parts.textPart, sourceText)) {
                // In Stash scene metadata this text is usually site/studio, but it can
                // also be useful title-like metadata. Either way it is a meaningful field.
                matches.add('title');
            }
        });

        return matches;
    }

    function isAutoSaveHighConfidenceMatch(fingerprint, fields) {
        if (!fingerprint || !fields) return false;

        const fieldCount = fields.size || 0;
        if (fieldCount <= 0) return false;
        if (fingerprint.matched < AUTO_SAVE_HIGH_CONFIDENCE_MIN_MATCHED_FINGERPRINTS) return false;

        // Main rule: very high fingerprint match plus at least one meaningful field.
        if (fingerprint.percent >= AUTO_SAVE_HIGH_CONFIDENCE_FINGERPRINT_PERCENT) {
            return true;
        }

        // Secondary rule: 17/19 and similar ratios are visually/semantically strong,
        // but just below 90%. Allow them only when several metadata fields agree.
        if (
            fingerprint.percent >= AUTO_SAVE_STRONG_FIELDS_FINGERPRINT_PERCENT &&
            fieldCount >= AUTO_SAVE_STRONG_FIELDS_MIN_FIELD_MATCHES
        ) {
            return true;
        }

        return false;
    }

    function findHighConfidenceAutoSaveCandidate(searchItem) {
        if (!ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT || !searchItem) return null;

        const sourceText = getSearchItemSourceText(searchItem);
        if (!sourceText) return null;

        const candidates = Array.from(searchItem.querySelectorAll('li.search-result'))
            .map((result, index) => {
                const fingerprint = getBestFingerprintInfo(result);
                const fields = getHighConfidenceFieldMatches(result, sourceText);

                if (!isAutoSaveHighConfidenceMatch(fingerprint, fields)) return null;

                const baseScore = getSearchResultScore(result, sourceText);
                const autoSaveScore = baseScore + (fields.size * 5) + (fingerprint.percent * 10) + (fingerprint.exact ? 1 : 0);

                return {
                    result,
                    index,
                    fingerprint,
                    fields,
                    score: autoSaveScore
                };
            })
            .filter(Boolean);

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.fields.size !== a.fields.size) return b.fields.size - a.fields.size;
            if (b.fingerprint.percent !== a.fingerprint.percent) return b.fingerprint.percent - a.fingerprint.percent;
            return a.index - b.index;
        });

        return candidates[0];
    }

    function isSaveButton(button) {
        if (!button || button.disabled) return false;
        const buttonText = (button.textContent || '').replace(/\s+/g, ' ').trim();
        return AUTO_SAVE_BUTTON_TEXTS.some(expectedText => buttonText === expectedText);
    }

    function findSaveButtonForResult(result) {
        if (!result) return null;

        return Array.from(result.querySelectorAll('button.btn.btn-primary'))
            .filter(isSaveButton)
            .filter(isElementVisible)[0] || null;
    }

    async function autoSaveHighConfidenceResult(searchItem) {
        if (!ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT || !searchItem) return false;
        if (searchItem.dataset.dmhAutoSavedHighConfidence === 'true') return false;

        const candidate = findHighConfidenceAutoSaveCandidate(searchItem);
        if (!candidate) return false;

        const activeResult = searchItem.querySelector('li.search-result.active, li.search-result.selected-result');
        if (activeResult !== candidate.result) {
            candidate.result.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));

            if (AUTO_SAVE_CLICK_DELAY_MS > 0) {
                await new Promise(resolve => window.setTimeout(resolve, AUTO_SAVE_CLICK_DELAY_MS));
            }

            runAllHighlights();
        }

        let freshActiveResult = searchItem.querySelector('li.search-result.active, li.search-result.selected-result');
        let saveButton = findSaveButtonForResult(candidate.result) || findSaveButtonForResult(freshActiveResult);

        if (!saveButton && AUTO_SAVE_SAVE_BUTTON_WAIT_TIMEOUT_MS > 0) {
            const waitStartedAt = Date.now();
            while (!saveButton && Date.now() - waitStartedAt < AUTO_SAVE_SAVE_BUTTON_WAIT_TIMEOUT_MS) {
                await new Promise(resolve => window.setTimeout(resolve, AUTO_SAVE_SAVE_BUTTON_WAIT_INTERVAL_MS));
                runAllHighlights();
                freshActiveResult = searchItem.querySelector('li.search-result.active, li.search-result.selected-result');
                saveButton = findSaveButtonForResult(candidate.result) || findSaveButtonForResult(freshActiveResult);
            }
        }

        if (!saveButton) return false;

        searchItem.dataset.dmhAutoSavedHighConfidence = 'true';
        searchItem.dataset.dmhAutoSavedHighConfidenceReason = [
            `fp=${candidate.fingerprint.matched}/${candidate.fingerprint.total}`,
            `pct=${Math.round(candidate.fingerprint.percent * 100)}%`,
            `fields=${Array.from(candidate.fields).join(',')}`
        ].join(';');

        if (AUTO_SAVE_BEFORE_SAVE_CLICK_DELAY_MS > 0) {
            await new Promise(resolve => window.setTimeout(resolve, AUTO_SAVE_BEFORE_SAVE_CLICK_DELAY_MS));
        }

        saveButton.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        if (AUTO_SAVE_AFTER_SAVE_CLICK_DELAY_MS > 0) {
            await new Promise(resolve => window.setTimeout(resolve, AUTO_SAVE_AFTER_SAVE_CLICK_DELAY_MS));
        }

        return true;
    }

    async function autoSaveHighConfidenceResultWithRetry(searchItem) {
        if (!ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT || !searchItem) return false;

        const startedAt = Date.now();

        while (true) {
            runAllHighlights();

            const candidate = findHighConfidenceAutoSaveCandidate(searchItem);
            if (candidate) {
                const saved = await autoSaveHighConfidenceResult(searchItem);
                if (saved) return true;
            }

            if (Date.now() - startedAt >= AUTO_SAVE_CANDIDATE_RETRY_TIMEOUT_MS) {
                return false;
            }

            await new Promise(resolve => window.setTimeout(resolve, AUTO_SAVE_CANDIDATE_RETRY_INTERVAL_MS));
        }
    }

    function waitForScrapeComparisonData(searchItem, beforeSignature) {
        if (!SCRAPE_BY_FRAGMENT_WAIT_FOR_RESULT || !searchItem) {
            return Promise.resolve(true);
        }

        const startedAt = Date.now();

        return new Promise(resolve => {
            const check = () => {
                if (!document.body.contains(searchItem)) {
                    resolve(false);
                    return;
                }

                if (hasNoScrapeResults(searchItem)) {
                    resolve(false);
                    return;
                }

                const currentSignature = getComparisonDataSignature(searchItem);
                const changed = currentSignature !== beforeSignature;

                if (changed && hasComparisonData(searchItem)) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startedAt >= SCRAPE_BY_FRAGMENT_WAIT_TIMEOUT_MS) {
                    resolve(false);
                    return;
                }

                window.setTimeout(check, SCRAPE_BY_FRAGMENT_POLL_INTERVAL_MS);
            };

            window.setTimeout(check, SCRAPE_BY_FRAGMENT_POLL_INTERVAL_MS);
        });
    }

    function setScrapeAllButtonState(button, text, disabled) {
        if (!button) return;
        button.textContent = text;
        button.disabled = !!disabled;
    }

    function findNavbarNewButtonWrapper() {
        const navbar = document.querySelector('.navbar-buttons');
        if (!navbar) return null;

        return Array.from(navbar.children).find(child => {
            const link = child.querySelector && child.querySelector('a[href="/scenes/new"]');
            if (!link) return false;

            const button = link.querySelector('button');
            const text = (button ? button.textContent : link.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            return /^(Новый|New)$/i.test(text);
        }) || null;
    }

    function ensureScrapeProgressCounter() {
        if (!ENABLE_SCRAPE_PROGRESS_NAVBAR_COUNTER) return null;

        const existing = document.querySelector('[data-dmh-scrape-progress-counter="true"]');
        if (existing) return existing;

        const newButtonWrapper = findNavbarNewButtonWrapper();
        if (!newButtonWrapper || !newButtonWrapper.parentNode) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'mr-2 d-flex align-items-center';
        wrapper.dataset.dmhScrapeProgressCounterWrapper = 'true';

        const badge = document.createElement('span');
        badge.className = 'badge badge-secondary';
        badge.dataset.dmhScrapeProgressCounter = 'true';
        badge.textContent = SCRAPE_PROGRESS_NAVBAR_COUNTER_IDLE_TEXT;
        badge.title = 'Состояние массового скрейпинга DataMatchHighlighter';
        badge.style.whiteSpace = 'nowrap';
        badge.style.fontSize = '0.875rem';
        badge.style.lineHeight = '1.5';
        badge.style.padding = '0.45rem 0.6rem';

        wrapper.appendChild(badge);
        newButtonWrapper.parentNode.insertBefore(wrapper, newButtonWrapper.nextSibling);

        return badge;
    }

    function setScrapeProgressCounterState(text, mode) {
        const counter = ensureScrapeProgressCounter();
        if (!counter) return;

        counter.textContent = text || SCRAPE_PROGRESS_NAVBAR_COUNTER_IDLE_TEXT;
        counter.dataset.dmhScrapeProgressMode = mode || 'idle';

        counter.classList.remove('badge-secondary', 'badge-primary', 'badge-success', 'badge-warning', 'badge-danger');

        if (mode === 'running') {
            counter.classList.add('badge-primary');
        } else if (mode === 'done') {
            counter.classList.add('badge-success');
        } else if (mode === 'warning') {
            counter.classList.add('badge-warning');
        } else if (mode === 'error') {
            counter.classList.add('badge-danger');
        } else {
            counter.classList.add('badge-secondary');
        }
    }

    function formatScrapeProgressCounter(remaining, total, savedCount, rememberedCount, skippedByMemory) {
        const parts = [`DMH: осталось ${remaining}/${total}`];
        if (savedCount > 0) parts.push(`сохр. ${savedCount}`);
        if (rememberedCount > 0) parts.push(`память ${rememberedCount}`);
        if (skippedByMemory > 0) parts.push(`пропуск ${skippedByMemory}`);
        return parts.join(' / ');
    }

    async function clickAllScrapeByFragmentButtons(triggerButton) {
        const allTasks = getScrapeByFragmentButtons()
            .map(button => ({
                button,
                searchItem: button.closest('div.search-item')
            }))
            .filter(task => task.searchItem);

        const rememberedAtStart = ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH
            ? allTasks.filter(task => isSearchItemRememberedAsNoAutoMatch(task.searchItem)).length
            : 0;

        const tasks = allTasks.filter(task => !isSearchItemRememberedAsNoAutoMatch(task.searchItem));
        const total = tasks.length;
        let skippedByMemory = rememberedAtStart;
        let savedCount = 0;
        let rememberedCount = 0;

        if (total === 0) {
            const emptyText = skippedByMemory > 0
                ? `Все пропущены: ${skippedByMemory}`
                : 'Фрагменты не найдены';

            setScrapeAllButtonState(triggerButton, emptyText, true);
            setScrapeProgressCounterState(
                skippedByMemory > 0
                    ? `DMH: остановлен / пропущено ${skippedByMemory}`
                    : 'DMH: нет задач / остановлен',
                skippedByMemory > 0 ? 'warning' : 'idle'
            );
            window.setTimeout(() => {
                setScrapeAllButtonState(triggerButton, SCRAPE_BY_FRAGMENT_ALL_BUTTON_TEXT, false);
            }, 1200);
            return;
        }

        setScrapeAllButtonState(triggerButton, `Скрейпинг 0/${total}`, true);
        setScrapeProgressCounterState(formatScrapeProgressCounter(total, total, savedCount, rememberedCount, skippedByMemory), 'running');

        for (let index = 0; index < tasks.length; index++) {
            const task = tasks[index];
            setScrapeProgressCounterState(formatScrapeProgressCounter(total - index, total, savedCount, rememberedCount, skippedByMemory), 'running');

            // The same filename can appear more than once on a long page. If a previous
            // iteration remembered it as having no auto-save candidate, skip duplicate
            // rows in the same run as well.
            if (isSearchItemRememberedAsNoAutoMatch(task.searchItem)) {
                skippedByMemory += 1;
                setScrapeAllButtonState(triggerButton, `Пропуск ${index + 1}/${total}`, true);
                setScrapeProgressCounterState(formatScrapeProgressCounter(total - index - 1, total, savedCount, rememberedCount, skippedByMemory), 'running');
                continue;
            }

            const scrapeButton = getCurrentScrapeButtonForSearchItem(task.searchItem, task.button);
            const beforeSignature = getComparisonDataSignature(task.searchItem);
            let clicked = false;
            let saved = false;

            if (scrapeButton && !scrapeButton.disabled && isElementVisible(scrapeButton)) {
                scrapeButton.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
                clicked = true;
            }

            if (clicked && SCRAPE_BY_FRAGMENT_WAIT_FOR_RESULT) {
                setScrapeAllButtonState(triggerButton, `Ожидание ${index + 1}/${total}`, true);
                setScrapeProgressCounterState(`DMH: ожидание ${index + 1}/${total} / осталось ${total - index}`, 'running');
                await waitForScrapeComparisonData(task.searchItem, beforeSignature);
                runAllHighlights();

                if (hasNoScrapeResults(task.searchItem)) {
                    rememberSearchItemAsNoAutoMatch(task.searchItem, 'nothing-found');
                    rememberedCount += 1;
                    setScrapeAllButtonState(triggerButton, `Не найдено ${index + 1}/${total}`, true);
                    setScrapeProgressCounterState(formatScrapeProgressCounter(total - index - 1, total, savedCount, rememberedCount, skippedByMemory), 'running');
                } else if (ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT) {
                    saved = await autoSaveHighConfidenceResultWithRetry(task.searchItem);

                    if (saved) {
                        savedCount += 1;
                        setScrapeAllButtonState(triggerButton, `Сохранено ${index + 1}/${total}`, true);
                        setScrapeProgressCounterState(formatScrapeProgressCounter(total - index - 1, total, savedCount, rememberedCount, skippedByMemory), 'running');
                    } else {
                        rememberSearchItemAsNoAutoMatch(task.searchItem, 'no-high-confidence-auto-save');
                        rememberedCount += 1;
                        setScrapeAllButtonState(triggerButton, `В память ${index + 1}/${total}`, true);
                        setScrapeProgressCounterState(formatScrapeProgressCounter(total - index - 1, total, savedCount, rememberedCount, skippedByMemory), 'running');
                    }
                }
            } else if (clicked && ENABLE_AUTO_SAVE_HIGH_CONFIDENCE_AFTER_FRAGMENT) {
                runAllHighlights();
                saved = await autoSaveHighConfidenceResultWithRetry(task.searchItem);

                if (saved) {
                    savedCount += 1;
                    setScrapeAllButtonState(triggerButton, `Сохранено ${index + 1}/${total}`, true);
                } else {
                    rememberSearchItemAsNoAutoMatch(task.searchItem, 'no-high-confidence-auto-save');
                    rememberedCount += 1;
                    setScrapeAllButtonState(triggerButton, `В память ${index + 1}/${total}`, true);
                }
            }

            setScrapeAllButtonState(triggerButton, `Скрейпинг ${index + 1}/${total}`, true);
            setScrapeProgressCounterState(formatScrapeProgressCounter(total - index - 1, total, savedCount, rememberedCount, skippedByMemory), 'running');

            if (SCRAPE_BY_FRAGMENT_CLICK_DELAY_MS > 0 && index < tasks.length - 1) {
                setScrapeAllButtonState(triggerButton, `Пауза ${index + 1}/${total}`, true);
                setScrapeProgressCounterState(`DMH: пауза / осталось ${total - index - 1}/${total}`, 'running');
                await new Promise(resolve => window.setTimeout(resolve, SCRAPE_BY_FRAGMENT_CLICK_DELAY_MS));
            }
        }

        const summaryParts = [`Готово: ${total}`];
        if (savedCount > 0) summaryParts.push(`сохр. ${savedCount}`);
        if (rememberedCount > 0) summaryParts.push(`память ${rememberedCount}`);
        if (skippedByMemory > 0) summaryParts.push(`пропущ. ${skippedByMemory}`);

        setScrapeAllButtonState(triggerButton, summaryParts.join(' / '), true);
        setScrapeProgressCounterState(`DMH: готово / осталось 0/${total} / ${summaryParts.slice(1).join(' / ') || 'без действий'}`, 'done');
        window.setTimeout(() => {
            setScrapeAllButtonState(triggerButton, SCRAPE_BY_FRAGMENT_ALL_BUTTON_TEXT, false);
        }, 1500);
    }

    function findScraperToolbar() {
        return Array.from(document.querySelectorAll('div.d-flex')).find(container => {
            const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
            const hasSubmitButton = text.includes('Отправить') || text.includes('Submit');
            const hasClearButton = text.includes('Убрать всё') || text.includes('Clear all');
            const hasConfigButton = !!container.querySelector('button[title="Показать конфигурацию"], button[title="Show configuration"]');

            // Some Stash layouts include "Hide unmatched scenes", and some do not.
            // The stable anchors for this toolbar are Submit + Clear all + Config.
            return hasSubmitButton && hasClearButton && hasConfigButton;
        });
    }

    function ensureScrapeByFragmentAllButton() {
        if (!ENABLE_SCRAPE_BY_FRAGMENT_ALL_BUTTON) return;

        const toolbar = findScraperToolbar();
        if (!toolbar) return;
        if (toolbar.querySelector('[data-dmh-scrape-all-button="true"]')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'ml-1';
        wrapper.dataset.dmhScrapeAllButton = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.textContent = SCRAPE_BY_FRAGMENT_ALL_BUTTON_TEXT;
        button.title = 'Последовательно нажать все «Скрейпить по фрагменту» и дождаться появления данных для сравнения';
        button.dataset.dmhScrapeAllButton = 'true';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            clickAllScrapeByFragmentButtons(button);
        });

        wrapper.appendChild(button);

        const configButtonWrapper = Array.from(toolbar.children).find(child =>
            child.querySelector('button[title="Показать конфигурацию"], button[title="Show configuration"]')
        );

        if (configButtonWrapper) {
            toolbar.insertBefore(wrapper, configButtonWrapper);
        } else {
            toolbar.appendChild(wrapper);
        }
    }

    function ensureClearScrapeSessionMemoryButton() {
        if (!ENABLE_CLEAR_SCRAPE_SESSION_MEMORY_BUTTON || !ENABLE_SCRAPE_SESSION_MEMORY_FOR_NO_AUTO_MATCH) return;

        const toolbar = findScraperToolbar();
        if (!toolbar) return;
        if (toolbar.querySelector('[data-dmh-clear-scrape-memory-button="true"]')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'ml-1';
        wrapper.dataset.dmhClearScrapeMemoryButton = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.textContent = CLEAR_SCRAPE_SESSION_MEMORY_BUTTON_TEXT;
        button.title = 'Очистить память файлов, для которых в этой сессии не было найдено автоматическое совпадение';
        button.dataset.dmhClearScrapeMemoryButton = 'true';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            const clearedCount = clearNoAutoMatchMemorySet();
            button.textContent = `Память очищена (${clearedCount})`;
            setScrapeProgressCounterState(`DMH: память очищена (${clearedCount}) / остановлен`, 'done');

            window.setTimeout(() => {
                button.textContent = CLEAR_SCRAPE_SESSION_MEMORY_BUTTON_TEXT;
            }, 1800);
        });

        wrapper.appendChild(button);

        const configButtonWrapper = Array.from(toolbar.children).find(child =>
            child.querySelector('button[title="Показать конфигурацию"], button[title="Show configuration"]')
        );

        if (configButtonWrapper) {
            toolbar.insertBefore(wrapper, configButtonWrapper);
        } else {
            toolbar.appendChild(wrapper);
        }
    }

    // Run all highlight behaviours together
    function runAllHighlights() {
        highlightMatches();
        highlightFingerprints();
        ensureScrapeByFragmentAllButton();
        ensureClearScrapeSessionMemoryButton();
        ensureScrapeProgressCounter();
    }

    // MutationObserver to watch for DOM changes and trigger the highlight functions
    const observer = new MutationObserver(runAllHighlights);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial execution of the highlight functions when the page is loaded
    window.addEventListener('load', runAllHighlights);
})();
