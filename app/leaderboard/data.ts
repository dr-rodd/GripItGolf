export interface Player {
  name: string
  role: 'Dad' | 'Mum' | 'Son'
  handicap: number
  scores: number[]     // stableford points per hole (0 for NR)
  gross: number[]      // gross strokes per hole (lowest NR gross for NR holes)
  nr?: boolean[]       // true where player took No Return
}

export interface Team {
  id: number
  name: string
  color: string
  players: Player[]
}

export const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

// Gross scores derived from stableford + shots received per hole.
// All holes are par 4, stroke indexes 1–18 (placeholder).
// shots_received = floor(hcp/18) + (1 if SI <= hcp%18)
// gross = par + 2 - stableford + shots_received  (when stableford > 0)
//       = 7 + shots_received                     (when stableford = 0, double bogey net)

export const teams: Team[] = [
  {
    id: 1,
    name: 'Team Grady',
    color: '#4A90D9',
    players: [
      {
        name: 'John', role: 'Dad', handicap: 11.9,
        scores: [2,1,3,2,3,2,2,1,2,3,2,2,3,2,2,1,2,3],
        gross:  [5,6,4,5,4,5,5,6,5,4,5,5,3,4,4,5,4,3],
      },
      {
        name: 'Aisling', role: 'Mum', handicap: 21.1,
        scores: [1,2,0,2,2,1,1,2,1,2,1,2,2,1,2,2,1,2],
        gross:  [7,6,8,5,5,6,6,5,6,5,6,5,5,6,5,5,6,5],
        nr:     [false,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
      },
      {
        name: 'Ross', role: 'Son', handicap: 9.4,
        scores: [3,2,3,2,2,3,2,2,3,2,3,2,2,3,2,2,3,2],
        gross:  [4,5,4,5,5,4,5,5,4,4,3,4,4,3,4,4,3,4],
      },
    ],
  },
  {
    id: 2,
    name: 'Team Martin',
    color: '#E05C3A',
    players: [
      {
        name: 'Martin', role: 'Dad', handicap: 14.0,
        scores: [2,2,2,1,2,2,1,2,2,2,2,1,2,2,2,2,1,2],
        gross:  [5,5,5,6,5,5,6,5,5,5,5,6,5,5,4,4,5,4],
      },
      {
        name: 'Eithne', role: 'Mum', handicap: 26.0,
        scores: [2,1,2,2,0,2,2,1,2,1,2,2,1,2,1,2,2,1],
        gross:  [6,7,6,6,8,6,6,7,5,6,5,5,6,5,6,5,5,6],
        nr:     [false,false,false,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false],
      },
      {
        name: 'Matthew', role: 'Son', handicap: 5.1,
        scores: [2,2,2,3,3,2,3,1,2,3,2,3,3,2,3,1,2,3],
        gross:  [5,5,5,4,4,4,3,5,4,3,4,3,3,4,3,5,4,3],
      },
    ],
  },
  {
    id: 3,
    name: 'Team Peters',
    color: '#5BAD6F',
    players: [
      {
        name: 'Peter', role: 'Dad', handicap: 18.0,
        scores: [2,2,1,2,2,2,2,1,2,2,2,1,2,2,2,2,1,2],
        gross:  [5,5,6,5,5,5,5,6,5,5,5,6,5,5,5,5,6,5],
      },
      {
        name: 'Liz', role: 'Mum', handicap: 22.0,
        scores: [1,2,2,1,2,1,2,2,1,2,2,2,1,2,2,1,2,2],
        gross:  [7,6,6,7,5,6,5,5,6,5,5,5,6,5,5,6,5,5],
      },
      {
        name: 'Dave', role: 'Son', handicap: 3.3,
        scores: [3,3,2,3,2,3,3,2,3,3,2,3,2,3,3,2,3,2],
        gross:  [4,4,5,3,4,3,3,4,3,3,4,3,4,3,3,4,3,4],
      },
    ],
  },
  {
    id: 4,
    name: 'Team Paul',
    color: '#A855F7',
    players: [
      {
        name: 'Paul', role: 'Dad', handicap: 14.6,
        scores: [2,1,2,2,2,2,1,2,2,2,1,2,2,2,2,1,2,2],
        gross:  [5,6,5,5,5,5,6,5,5,5,6,5,5,5,5,5,4,4],
      },
      {
        name: 'Gillian', role: 'Mum', handicap: 24.0,
        scores: [1,2,1,2,1,2,2,1,2,1,2,1,2,1,2,2,1,2],
        gross:  [7,6,7,6,7,6,5,6,5,6,5,6,5,6,5,5,6,5],
      },
      {
        name: 'Sam', role: 'Son', handicap: 12.0,
        scores: [2,2,3,2,2,2,2,2,2,2,3,2,2,2,2,2,2,3],
        gross:  [5,5,4,5,5,5,5,5,5,5,4,5,4,4,4,4,4,3],
      },
    ],
  },
]

export function bestBall(team: Team): { pts: number; gross: number; role: Player['role'] }[] {
  return HOLES.map((_, i) => {
    let best: { pts: number; gross: number; role: Player['role'] } = { pts: 0, gross: 99, role: 'Dad' }
    for (const p of team.players) {
      const pts   = p.scores[i]
      const gross = p.gross[i]
      if (pts > best.pts || (pts === best.pts && gross < best.gross)) {
        best = { pts, gross, role: p.role }
      }
    }
    return best
  })
}

export function teamTotal(team: Team): number {
  return bestBall(team).reduce((sum, h) => sum + h.pts, 0)
}

export function playerTotal(player: Player): number {
  return player.scores.reduce((a, b) => a + b, 0)
}

export function hasNR(player: Player): boolean {
  return player.nr?.some(Boolean) ?? false
}

// Gross total using lowest NR gross for NR holes (already stored in gross[])
export function playerGrossTotal(player: Player): number {
  return player.gross.reduce((a, b) => a + b, 0)
}

export function rankedTeams(ts: Team[]) {
  return [...ts].sort((a, b) => teamTotal(b) - teamTotal(a))
}
