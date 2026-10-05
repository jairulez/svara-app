// Goal catalogue (shared by questions, discovery, onboarding). Kept dependency-free to avoid import cycles.
export const GOALS = [
  { key: 'night_routine', label: 'Better night routine', emoji: '🌙', dimensions: ['sleep', 'relaxation'] },
  { key: 'relaxation', label: 'More relaxation', emoji: '🧘', dimensions: ['relaxation', 'stress'] },
  { key: 'energy', label: 'More energy', emoji: '⚡', dimensions: ['energy'] },
  { key: 'focus', label: 'Better focus', emoji: '🎯', dimensions: ['focus'] },
  { key: 'recovery', label: 'Recovery', emoji: '🏃', dimensions: ['recovery', 'energy'] },
  { key: 'mood', label: 'Better everyday mood', emoji: '🙂', dimensions: ['mood'] },
  { key: 'motivation', label: 'Motivation', emoji: '🔥', dimensions: ['motivation'] },
  { key: 'social', label: 'Social wellbeing', emoji: '🤝', dimensions: ['social_connection'] },
];

// Content categories that support each dimension (for resource suggestions).
export const DIM_CATEGORY = {
  sleep: 'Sleep', energy: 'Energy', mood: 'Mood', relaxation: 'Relaxation', motivation: 'Motivation', focus: 'Focus',
  recovery: 'Recovery', social_connection: 'Lifestyle', stress: 'Relaxation', overall_wellbeing: 'Wellness science',
};

// Preferred routine per goal / dimension (by routine id).
export const GOAL_ROUTINE = {
  night_routine: 'r_evening_wind_down', relaxation: 'r_breathing_break', energy: 'r_morning_reset', focus: 'r_workday_reset',
  recovery: 'r_weekend_recovery', mood: 'r_movement_break', motivation: 'r_morning_reset', social: 'r_screen_free_evening',
};
export const DIM_ROUTINE = {
  sleep: 'r_sleep_consistency', energy: 'r_morning_reset', mood: 'r_movement_break', relaxation: 'r_evening_wind_down', motivation: 'r_morning_reset',
  focus: 'r_workday_reset', recovery: 'r_weekend_recovery', social_connection: 'r_screen_free_evening', stress: 'r_breathing_break', overall_wellbeing: 'r_evening_wind_down',
};
