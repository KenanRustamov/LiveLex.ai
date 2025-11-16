export type OverallStats = {
  totalWords: number;
  totalSessions: number;
  overallAccuracy: number;
  totalAttempts: number;
  sessions: Array<{
    session_id: string;
    timestamp: string;
    summary: {
      items: Array<any>;
      total: number;
      correct_count: number;
      incorrect_count: number;
    };
  }>;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  imagePath: string;
  criteria: (stats: OverallStats) => boolean;
  progress?: (stats: OverallStats) => { current: number; target: number };
};

export const achievements: Achievement[] = [
  // 🌱 Beginner / Onboarding
  {
    id: 'first-find',
    name: 'First Find',
    description: 'Identify your first real-world object using AR',
    imagePath: '/badges/First Find.png',
    criteria: (stats) => stats.totalWords >= 1,
  },
  {
    id: 'word-wanderer',
    name: 'Word Wanderer',
    description: 'Learn 10 unique object names',
    imagePath: '/badges/Word Wanderer.png',
    criteria: (stats) => stats.totalWords >= 10,
    progress: (stats) => ({ current: stats.totalWords, target: 10 }),
  },
  {
    id: 'room-rookie',
    name: 'Room Rookie',
    description: 'Complete your first room scan with all required objects labeled',
    imagePath: '/badges/Room Rookie.png',
    criteria: (stats) => {
      // Check if any session has 100% completion (correct_count === total)
      return stats.sessions.some(
        (session) => session.summary.total > 0 && session.summary.correct_count === session.summary.total
      );
    },
  },
  {
    id: 'pronunciation-pioneer',
    name: 'Pronunciation Pioneer',
    description: 'Successfully pronounce your first word with passing accuracy',
    imagePath: '/badges/Pronunciation Pioneer.png',
    criteria: (stats) => {
      // Check if user has at least one correct pronunciation
      // This is true if totalWords > 0 and there's at least one correct attempt
      return stats.totalWords > 0 && stats.totalAttempts > 0 && stats.overallAccuracy > 0;
    },
  },
  // 🔍 Exploration-Focused
  {
    id: 'everyday-explorer',
    name: 'Everyday Explorer',
    description: 'Scan and learn 25 different objects across multiple rooms',
    imagePath: '/badges/Everyday Explorer.png',
    criteria: (stats) => stats.totalWords >= 25,
    progress: (stats) => ({ current: stats.totalWords, target: 25 }),
  },
  {
    id: 'multispace-master',
    name: 'Multispace Master',
    description: 'Identify objects in 5 different locations',
    imagePath: '/badges/Room Rookie.png', // Using placeholder - need badge image
    criteria: (stats) => {
      // Note: This requires location data in sessions which may not be available yet
      // For now, using session count as proxy (5+ sessions = likely different locations)
      // TODO: Update when location data is available in session metadata
      return stats.totalSessions >= 5;
    },
    progress: (stats) => ({ current: stats.totalSessions, target: 5 }),
  },
  // 🎯 Mastery / Progression
  {
    id: 'label-legend',
    name: 'Label Legend',
    description: 'Learn 100 real-world object names',
    imagePath: '/badges/Word Wanderer.png', // Using placeholder - need badge image
    criteria: (stats) => stats.totalWords >= 100,
    progress: (stats) => ({ current: stats.totalWords, target: 100 }),
  },
  {
    id: 'consistency-champion',
    name: 'Consistency Champion',
    description: 'Complete learning sessions 7 days in a row',
    imagePath: '/badges/Room Rookie.png', // Using placeholder - need badge image
    criteria: (stats) => {
      // Calculate 7-day streak from session timestamps
      if (stats.sessions.length < 7) return false;
      
      const sortedSessions = [...stats.sessions]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Check if there are sessions on 7 consecutive days
      const dates = sortedSessions.map((s) => {
        const date = new Date(s.timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      });
      
      const uniqueDates = Array.from(new Set(dates)).sort((a, b) => b - a);
      
      if (uniqueDates.length < 7) return false;
      
      // Check for 7 consecutive days starting from most recent
      for (let i = 0; i <= uniqueDates.length - 7; i++) {
        let consecutive = true;
        for (let j = 0; j < 6; j++) {
          const day1 = new Date(uniqueDates[i + j]);
          const day2 = new Date(uniqueDates[i + j + 1]);
          const diffDays = (day1.getTime() - day2.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays !== 1) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) return true;
      }
      return false;
    },
    progress: (stats) => {
      // Calculate current streak length
      if (stats.sessions.length === 0) return { current: 0, target: 7 };
      
      const sortedSessions = [...stats.sessions]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const dates = sortedSessions.map((s) => {
        const date = new Date(s.timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      });
      
      const uniqueDates = Array.from(new Set(dates)).sort((a, b) => b - a);
      
      if (uniqueDates.length === 0) return { current: 0, target: 7 };
      
      // Find longest consecutive streak
      let maxStreak = 1;
      let currentStreak = 1;
      
      for (let i = 0; i < uniqueDates.length - 1; i++) {
        const day1 = new Date(uniqueDates[i]);
        const day2 = new Date(uniqueDates[i + 1]);
        const diffDays = (day1.getTime() - day2.getTime()) / (1000 * 60 * 60 * 24);
        
        if (diffDays === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }
      
      return { current: Math.min(maxStreak, 7), target: 7 };
    },
  },
  // 🎮 Skill / Challenge
  {
    id: 'the-minimalist',
    name: 'The Minimalist',
    description: 'Complete a scanning session with perfect accuracy and no mistakes',
    imagePath: '/badges/Pronunciation Pioneer.png', // Using placeholder - need badge image
    criteria: (stats) => {
      // Check if any session has perfect accuracy (correct_count === total && incorrect_count === 0)
      return stats.sessions.some(
        (session) =>
          session.summary.total > 0 &&
          session.summary.correct_count === session.summary.total &&
          session.summary.incorrect_count === 0
      );
    },
  },
];

