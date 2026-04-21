/**
 * Lightweight language detector for multi-lingual input.
 * Detects: English, Urdu (unicode), Roman Urdu (latin-script Urdu), Mixed.
 * No external dependency — pure heuristic.
 */

export type DetectedLanguage = 'english' | 'urdu' | 'roman-urdu' | 'mixed' | 'unknown'

// Common Urdu Unicode range (U+0600–U+06FF)
const URDU_UNICODE_REGEX = /[؀-ۿ]/

// High-frequency Roman Urdu words
const ROMAN_URDU_WORDS = new Set([
    'kya', 'hai', 'hain', 'mujhe', 'tum', 'aap', 'main', 'mein', 'kaise', 'kyun',
    'theek', 'nahi', 'nahin', 'bilkul', 'accha', 'acha', 'zaroor', 'lekin', 'leken',
    'par', 'aur', 'ya', 'matlab', 'samjhao', 'batao', 'dekho', 'yaar', 'bhai',
    'dost', 'shukriya', 'shukria', 'meherbani', 'please', 'btao', 'bta', 'kr',
    'karo', 'chahiye', 'chahye', 'lagta', 'pata', 'thoda', 'bohot', 'bahut',
    'zyada', 'zada', 'wala', 'walay', 'kuch', 'koi', 'sab', 'sirf', 'bas',
    'abhi', 'kal', 'aj', 'aaj', 'raat', 'din', 'waqt', 'time', 'help', 'karein',
    'karna', 'karne', 'baat', 'dikhao', 'chaiye', 'chahie', 'nikalo', 'nikaali',
    'dhundo', 'dhund', 'dhondo', 'clients', 'customers', 'leads', 'business',
    'market', 'sales', 'bechna', 'becho', 'paisay', 'paise', 'paisa', 'kam'
])

export function detectLanguage(text: string): DetectedLanguage {
    const hasUrduScript = URDU_UNICODE_REGEX.test(text)
    const lower = text.toLowerCase()
    const words = lower.split(/\s+/)
    const romanUrduCount = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length
    const romanUrduRatio = romanUrduCount / Math.max(words.length, 1)

    if (hasUrduScript && romanUrduRatio > 0.1) return 'mixed'
    if (hasUrduScript) return 'urdu'
    if (romanUrduRatio >= 0.12) return 'roman-urdu'
    if (romanUrduRatio > 0.04) return 'mixed'
    return 'english'
}

export function getResponseLanguageInstruction(lang: DetectedLanguage): string {
    switch (lang) {
        case 'urdu':
            return 'The user is writing in Urdu. Respond in Urdu script (اردو). Keep technical terms in English but explain in Urdu.'
        case 'roman-urdu':
            return 'The user is writing in Roman Urdu (Urdu written in English letters). Respond in Roman Urdu. Example: "Yeh kaam aise karta hai..."'
        case 'mixed':
            return 'The user is mixing English and Urdu/Roman Urdu. Match their style — mix both languages naturally in your response.'
        default:
            return 'Respond in clear, fluent English.'
    }
}
