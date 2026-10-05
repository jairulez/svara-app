// Approved question library. Wellness check-ins only: no diagnostic or clinical questions.
// Options are ordered low → high raw value (1..5); `reverse` means a high answer is a worse state.
const O = {
  S5: ['Not at all', 'A little', 'Somewhat', 'Quite a bit', 'Very much'],
  EASE: ['Very difficult', 'Difficult', 'Okay', 'Easy', 'Very easy'],
  LVL: ['Very low', 'Low', 'Moderate', 'High', 'Very high'],
  EMO: ['😞 Very low', '😕 Low', '😐 Okay', '🙂 Good', '😄 Great'],
  AMT: ['Not at all', 'A little', 'Somewhat', 'Quite a bit', 'Extremely'],
  FREQ: ['Never', 'Rarely', 'Sometimes', 'Often', 'Almost always'],
  QUAL: ['Very poor', 'Poor', 'Okay', 'Good', 'Very good'],
};

// [id, dimension, question, response_type, options, reverse, sensitivity, freq_days, safety_category]
export const ASSESSMENT = [
  ['qa_sleep', 'sleep', 'How refreshed did you feel when you woke up?', 'scale5', ['Not at all', 'Slightly', 'Somewhat', 'Quite', 'Very refreshed']],
  ['qa_energy', 'energy', 'How energetic did you feel?', 'slider', O.LVL],
  ['qa_mood', 'mood', 'How was your mood through the day?', 'emoji', O.EMO],
  ['qa_relaxation', 'relaxation', 'How easy was it to relax today?', 'choice', O.EASE],
  ['qa_motivation', 'motivation', 'How motivated did you feel?', 'scale5', ['Not at all', 'A little', 'Somewhat', 'Quite', 'Very motivated']],
  ['qa_focus', 'focus', 'How easy was it to stay focused?', 'choice', O.EASE],
  ['qa_recovery', 'recovery', 'How well recovered did you feel after the day\'s activity?', 'scale5', ['Not at all', 'A little', 'Somewhat', 'Quite well', 'Very well']],
  ['qa_social', 'social_connection', 'How connected did you feel to the people around you?', 'scale5', ['Not at all', 'A little', 'Somewhat', 'Quite', 'Very connected']],
  ['qa_stress', 'stress', 'How mentally overloaded did you feel?', 'scale5', O.AMT, 1, 'medium'],
  ['qa_overall', 'overall_wellbeing', 'How satisfied were you with your day?', 'emoji', ['😞 Not at all', '😕 A little', '😐 Fairly', '🙂 Quite', '😄 Very']],
];

export const DAILY = [
  // sleep
  ['qd_sleep_quality', 'sleep', 'How would you rate the quality of your sleep last night?', 'scale5', O.QUAL],
  ['qd_sleep_onset', 'sleep', 'How easy was it to fall asleep last night?', 'choice', O.EASE],
  ['qd_sleep_wake', 'sleep', 'How often did you wake during the night?', 'choice', O.FREQ, 1],
  ['qd_sleep_rested', 'sleep', 'How rested did you feel by mid-morning?', 'slider', O.LVL],
  ['qd_sleep_bedtime', 'sleep', 'How consistent was your bedtime this week?', 'choice', ['Very inconsistent', 'Inconsistent', 'Somewhat consistent', 'Consistent', 'Very consistent'], 0, 'low', 5],
  // energy
  ['qd_energy_morning', 'energy', 'How was your energy in the morning?', 'slider', O.LVL],
  ['qd_energy_afternoon', 'energy', 'How was your energy in the afternoon?', 'slider', O.LVL],
  ['qd_energy_steady', 'energy', 'How steady did your energy feel across the day?', 'choice', ['Very uneven', 'Uneven', 'Mixed', 'Steady', 'Very steady']],
  ['qd_energy_slump', 'energy', 'How much of an afternoon slump did you notice?', 'scale5', O.AMT, 1],
  ['qd_energy_ready', 'energy', 'How ready did you feel for physical activity today?', 'scale5', O.S5],
  // mood
  ['qd_mood_now', 'mood', 'How would you describe your mood right now?', 'emoji', O.EMO],
  ['qd_mood_upbeat', 'mood', 'How often did you feel upbeat today?', 'choice', O.FREQ],
  ['qd_mood_calm', 'mood', 'How calm was your mood through the day?', 'scale5', O.QUAL],
  ['qd_mood_irritable', 'mood', 'How irritable did you feel today?', 'scale5', O.AMT, 1, 'medium', 4, 'emotional_sensitive'],
  ['qd_mood_enjoy', 'mood', 'How much did you enjoy small moments today?', 'scale5', O.S5],
  // relaxation
  ['qd_relax_switchoff', 'relaxation', 'How easy was it to switch off after work today?', 'choice', O.EASE],
  ['qd_relax_body', 'relaxation', 'How relaxed did your body feel this evening?', 'scale5', O.S5],
  ['qd_relax_pause', 'relaxation', 'How often did you manage a proper pause today?', 'choice', O.FREQ],
  ['qd_relax_tense', 'relaxation', 'How tense did your shoulders and neck feel?', 'scale5', O.AMT, 1],
  ['qd_relax_mind', 'relaxation', 'How settled did your mind feel before bed?', 'scale5', O.S5],
  // motivation
  ['qd_motiv_start', 'motivation', 'How much did you feel like getting things started today?', 'scale5', O.S5],
  ['qd_motiv_goals', 'motivation', 'How driven did you feel toward your goals?', 'slider', O.LVL],
  ['qd_motiv_begin', 'motivation', 'How easy was it to begin the tasks you planned?', 'choice', O.EASE],
  ['qd_motiv_putoff', 'motivation', 'How much did you put things off today?', 'scale5', O.AMT, 1],
  ['qd_motiv_interest', 'motivation', 'How interested did you feel in what you were doing?', 'scale5', O.S5],
  // focus
  ['qd_focus_concentrate', 'focus', 'How easy was it to concentrate today?', 'choice', O.EASE],
  ['qd_focus_distract', 'focus', 'How often did distractions pull you away?', 'choice', O.FREQ, 1],
  ['qd_focus_clear', 'focus', 'How clear did your thinking feel?', 'scale5', O.QUAL],
  ['qd_focus_span', 'focus', 'How long could you stay with one task?', 'choice', ['Only moments', 'A few minutes', 'Around 20 minutes', 'Around 45 minutes', 'An hour or more']],
  ['qd_focus_afternoon', 'focus', 'How sharp did you feel in the afternoon?', 'slider', O.LVL],
  // recovery
  ['qd_rec_body', 'recovery', 'How recovered did your body feel today?', 'scale5', ['Not at all', 'A little', 'Somewhat', 'Quite well', 'Very well']],
  ['qd_rec_stiff', 'recovery', 'How sore or stiff did you feel?', 'scale5', O.AMT, 1],
  ['qd_rec_bounce', 'recovery', 'How well did you bounce back after a busy stretch?', 'choice', O.EASE],
  ['qd_rec_rest', 'recovery', 'How much rest time did you give yourself today?', 'choice', ['None', 'A little', 'Some', 'Quite a bit', 'Plenty']],
  // social connection
  ['qd_soc_time', 'social_connection', 'How much quality time did you spend with people you care about?', 'scale5', ['None', 'A little', 'Some', 'Quite a bit', 'A lot']],
  ['qd_soc_support', 'social_connection', 'How supported did you feel today?', 'scale5', O.S5],
  ['qd_soc_warm', 'social_connection', 'How often did you have a conversation that felt warm?', 'choice', O.FREQ],
  ['qd_soc_lonely', 'social_connection', 'How lonely did you feel today?', 'scale5', O.AMT, 1, 'high', 7, 'emotional_sensitive'],
  ['qd_soc_reach', 'social_connection', 'How comfortable did you feel reaching out to someone?', 'choice', O.EASE, 0, 'medium'],
  // stress (reverse-coded where a high answer is worse; label "Stress ease")
  ['qd_stress_pressure', 'stress', 'How pressured did your day feel?', 'scale5', O.AMT, 1, 'medium'],
  ['qd_stress_worry', 'stress', 'How much did worries weigh on your mind?', 'scale5', O.AMT, 1, 'high', 7, 'emotional_sensitive'],
  ['qd_stress_rushed', 'stress', 'How often did you feel rushed?', 'choice', O.FREQ, 1],
  ['qd_stress_todo', 'stress', 'How manageable did your to-do list feel?', 'choice', ['Overwhelming', 'Heavy', 'Okay', 'Manageable', 'Very manageable']],
  ['qd_stress_spill', 'stress', 'How much did your workload spill into your evening?', 'scale5', O.AMT, 1],
  // overall
  ['qd_overall_day', 'overall_wellbeing', 'How would you rate today overall?', 'emoji', O.EMO],
  ['qd_overall_balance', 'overall_wellbeing', 'How balanced did your day feel?', 'choice', ['Very unbalanced', 'Unbalanced', 'Mixed', 'Balanced', 'Very balanced']],
  ['qd_overall_match', 'overall_wellbeing', 'How much did today match the kind of day you wanted?', 'scale5', O.S5],
];

const mk = (pool, defaultFreq) => ([id, dimension, question, response_type, options, reverse = 0, sensitivity_level = 'low', freq, safety_category = 'general_wellness']) => ({
  id, pool, dimension, question, response_type, options: JSON.stringify(options), reverse, sensitivity_level,
  allowed_frequency_days: freq ?? defaultFreq, active: 1, safety_category,
});
export const QUESTION_ROWS = [...ASSESSMENT.map(mk('assessment', 7)), ...DAILY.map(mk('daily', 3))];
