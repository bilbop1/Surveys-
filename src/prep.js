/**
 * Interview prep bank.
 *
 * These are practice prompts for performing well IN the research sessions
 * you legitimately get selected for. Performing well is the real income
 * lever: good sessions → researcher requests you again → repeat invites.
 *
 * Nothing here games a screener. Screeners must be answered honestly —
 * they exist to match real people to real studies, and lying gets you
 * flagged and removed. This is about being articulate, on time, and
 * genuinely useful once you're in the room.
 */

export const PREP_BANK = {
  categories: [
    {
      id: 'think-aloud',
      name: 'Think-Aloud Practice',
      blurb: 'Most usability sessions ask you to narrate your thoughts while using a product. Practice talking continuously without going silent.',
      questions: [
        'Open any app on your phone and narrate every thought out loud for 90 seconds as you complete one task.',
        'Walk through signing up for a new service while explaining what you expect each button to do.',
        "Describe a moment a website confused you recently — what did you expect vs. what happened?",
        'Pick a feature you use daily and explain, step by step, why you trust it.',
      ],
      tips: [
        'Narrate expectations BEFORE you click, then react to what actually happens.',
        'Silence is the enemy — "I\'m looking for..." is better than pausing.',
        'Describe feelings, not just actions: "this makes me hesitant because...".',
      ],
    },
    {
      id: 'behavioral',
      name: 'Behavioral / Context',
      blurb: 'Moderated interviews dig into how you actually live and work. Have concrete stories ready.',
      questions: [
        'Walk me through the last time you bought something online that you researched first.',
        'Describe your typical morning routine with your phone, minute by minute.',
        'Tell me about a tool you stopped using — what made you quit?',
        'How do you decide which app to trust with your payment info?',
      ],
      tips: [
        'Use the STAR shape: Situation, Task, Action, Result.',
        'Specifics beat generalities — names, numbers, last-time-this-happened.',
        'It is fine to say "I don\'t do that" — researchers value honest non-users too.',
      ],
    },
    {
      id: 'product-feedback',
      name: 'Product Feedback',
      blurb: 'Concept tests and feedback sessions want sharp, specific reactions — not politeness.',
      questions: [
        'You\'re shown a new feature. What three questions would you ask before trusting it?',
        'Critique an onboarding flow you remember — what was one thing it got right and one it got wrong?',
        'If you could change one thing about your most-used app, what and why?',
        'How would you explain this product to a skeptical friend?',
      ],
      tips: [
        'Be candidly critical — researchers are paying for honesty, not approval.',
        'Tie every reaction to a reason ("confusing because the label said X").',
        'Rank your reactions: lead with the strongest one.',
      ],
    },
    {
      id: 'logistics',
      name: 'Logistics & Professionalism',
      blurb: 'The fastest way to get re-invited is being effortless to work with.',
      questions: [
        'Confirm: is your webcam working, lighting good, background quiet?',
        'Practice a 20-second self-intro: name, role, why this topic is familiar to you.',
        'Rehearse joining a call 5 minutes early and testing audio.',
      ],
      tips: [
        'Never no-show. If you must cancel, do it 24h+ ahead inside the platform.',
        'Good light + clear mic visibly improves your invite rate over time.',
        'Keep answers tight — researchers have a script and limited time.',
      ],
    },
  ],
};
