const NOTE = 'General wellness activity, not a medical treatment. Stop if anything feels uncomfortable, and adapt it to your own body and circumstances.';
const meta = { type: 'general_wellness', author: 'SVARA editorial team', evidence_note: 'Everyday habit ideas drawn from common sleep-hygiene and mindfulness guidance; not individualised advice.' };

export const ROUTINES = [
  { id: 'r_evening_wind_down', name: 'Evening Wind-Down', goal: 'night_routine', duration_min: 20, frequency: 'Most evenings', dimensions: ['relaxation', 'sleep'],
    steps: ['Set a gentle end-of-work moment: close tabs and write tomorrow\'s first task.', 'Dim the lights and put your phone on a charger away from the bed.', 'Make a warm caffeine-free drink or wash your face slowly.', 'Do five minutes of light stretching or quiet sitting.', 'Write one line about how the day felt.'] },
  { id: 'r_morning_reset', name: 'Morning Reset', goal: 'energy', duration_min: 10, frequency: 'Weekday mornings', dimensions: ['energy', 'motivation'],
    steps: ['Open a window or step outside for a few minutes of daylight.', 'Drink a glass of water.', 'Stretch your back, neck and shoulders for two minutes.', 'Choose the one thing that would make today feel well spent.'] },
  { id: 'r_workday_reset', name: 'Workday Reset', goal: 'focus', duration_min: 8, frequency: 'Once or twice a workday', dimensions: ['focus', 'stress'],
    steps: ['Stand up and step away from your screen.', 'Look at something far away for thirty seconds.', 'Take five slow breaths, breathing out a little longer than in.', 'Pick the next single task and silence one notification source.'] },
  { id: 'r_weekend_recovery', name: 'Weekend Recovery', goal: 'recovery', duration_min: 45, frequency: 'Weekends', dimensions: ['recovery', 'energy'],
    steps: ['Keep your wake-up time within an hour of your usual one.', 'Take an unhurried walk or gentle movement you enjoy.', 'Schedule one thing that is purely for pleasure.', 'Prepare one simple meal and eat it away from your screen.', 'Plan a calm Sunday evening so Monday feels lighter.'] },
  { id: 'r_screen_free_evening', name: 'Screen-Free Evening', goal: 'relaxation', duration_min: 60, frequency: 'A few evenings a week', dimensions: ['relaxation', 'social_connection'],
    steps: ['Pick a start time and tell the people around you.', 'Put devices in another room or in a drawer.', 'Choose an analogue activity: a book, cooking, a board game, a call with a friend.', 'Notice how the evening feels compared with usual.'] },
  { id: 'r_movement_break', name: 'Movement Break', goal: 'mood', duration_min: 5, frequency: 'Every few hours', dimensions: ['mood', 'energy'],
    steps: ['Stand up and roll your shoulders back ten times.', 'Walk for two minutes, indoors or out.', 'Reach overhead and gently stretch each side.', 'Finish with a glass of water.'] },
  { id: 'r_breathing_break', name: 'Breathing Break', goal: 'relaxation', duration_min: 5, frequency: 'Whenever you pause', dimensions: ['relaxation', 'stress'],
    steps: ['Sit comfortably and let your shoulders drop.', 'Breathe in through your nose for a count of four.', 'Breathe out slowly for a count of six.', 'Repeat for about two minutes, then notice how you feel.'] },
  { id: 'r_sleep_consistency', name: 'Sleep Consistency', goal: 'night_routine', duration_min: 10, frequency: 'Daily', dimensions: ['sleep'],
    steps: ['Choose a realistic bedtime and wake-up window.', 'Set a quiet reminder thirty minutes before bedtime.', 'Keep the same wake-up time for the week, including weekends where you can.', 'Note in your check-in how you felt on waking.'] },
  { id: 'r_digital_sunset', name: 'Digital Sunset', goal: 'night_routine', duration_min: 30, frequency: 'Most evenings', dimensions: ['sleep', 'relaxation'],
    steps: ['Pick a time about an hour before bed as your digital sunset.', 'Switch devices to night mode, then to do-not-disturb.', 'Move to a lamp-lit space for reading, music or conversation.', 'Leave your phone to charge outside the bedroom if you can.'] },
].map((r) => ({ ...r, steps: JSON.stringify(r.steps), dimensions: JSON.stringify(r.dimensions), source_metadata: JSON.stringify(meta), safety_notes: NOTE, active: 1 }));
