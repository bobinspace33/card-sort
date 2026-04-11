export interface CardData {
  id: string;
  frontText: string;
  frontImage: string;
  backText: string;
  backImage: string;
  correctCategory: string;
}

export interface Activity {
  id?: string;
  title: string;
  categories: string[];
  cards: CardData[];
  checkAnswers: boolean;
  showScore: boolean;
  /** Optional URL; shown behind the student activity UI at 30% opacity. */
  backgroundImage?: string;
  /** Six-character code for students to open `/` → Student Code (optional on legacy activities). */
  studentCode?: string;
  ownerId: string;
  createdAt: any;
}

export interface Response {
  id?: string;
  studentName: string;
  placements: Record<string, string>; // cardId -> category
  score: number;
  submittedAt: any;
}
