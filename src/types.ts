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
