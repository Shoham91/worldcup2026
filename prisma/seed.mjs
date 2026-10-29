// Seed the World Cup 2026 prediction pool.
// Run with: node prisma/seed.mjs   (safe to re-run — upserts).
import pkg from "@prisma/client";
import bcrypt from "bcryptjs";

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// Official 2026 group draw (Washington, D.C., 5 Dec 2025).
const GROUPS = {
  A: [["Mexico", "MEX"], ["South Korea", "KOR"], ["South Africa", "RSA"], ["Czechia", "CZE"]],
  B: [["Canada", "CAN"], ["Switzerland", "SUI"], ["Qatar", "QAT"], ["Bosnia & Herzegovina", "BIH"]],
  C: [["Brazil", "BRA"], ["Morocco", "MAR"], ["Scotland", "SCO"], ["Haiti", "HAI"]],
  D: [["United States", "USA"], ["Paraguay", "PAR"], ["Australia", "AUS"], ["Türkiye", "TUR"]],
  E: [["Germany", "GER"], ["Ecuador", "ECU"], ["Ivory Coast", "CIV"], ["Curaçao", "CUW"]],
  F: [["Netherlands", "NED"], ["Japan", "JPN"], ["Tunisia", "TUN"], ["Sweden", "SWE"]],
  G: [["Belgium", "BEL"], ["Iran", "IRN"], ["Egypt", "EGY"], ["New Zealand", "NZL"]],
  H: [["Spain", "ESP"], ["Uruguay", "URU"], ["Saudi Arabia", "KSA"], ["Cape Verde", "CPV"]],
  I: [["France", "FRA"], ["Senegal", "SEN"], ["Norway", "NOR"], ["Iraq", "IRQ"]],
  J: [["Argentina", "ARG"], ["Austria", "AUT"], ["Algeria", "ALG"], ["Jordan", "JOR"]],
  K: [["Portugal", "POR"], ["Colombia", "COL"], ["Uzbekistan", "UZB"], ["DR Congo", "COD"]],
  L: [["England", "ENG"], ["Croatia", "CRO"], ["Panama", "PAN"], ["Ghana", "GHA"]],
};

const PHASES = [
  // GROUP locks 30 min before the opener (11 Jun 2026, 13:00 Mexico City = 18:30 UTC = 21:30 Israel).
  {
    key: "GROUP",
    label: "Group Stage",
    sort: 1,
    isOpen: true,
    locksAt: new Date("2026-06-11T18:30:00.000Z"),
  },
  { key: "R32", label: "Round of 32", sort: 2, isOpen: false },
  { key: "R16", label: "Round of 16", sort: 3, isOpen: false },
  { key: "QF", label: "Quarter-finals", sort: 4, isOpen: false },
  { key: "SF", label: "Semi-finals", sort: 5, isOpen: false },
  { key: "THIRD", label: "Third-place Playoff", sort: 6, isOpen: false },
  { key: "FINAL", label: "Final", sort: 7, isOpen: false },
];

const KO_MATCHES = { R32: 16, R16: 8, QF: 4, SF: 2, THIRD: 1, FINAL: 1 };

// Round-robin pairings within a group of 4 (by seeded index), by matchday.
const RR = [
  [[0, 1], [2, 3]], // MD1
  [[0, 2], [3, 1]], // MD2
  [[3, 0], [1, 2]], // MD3
];

// Curated goal-scorer candidates per team (dropdown options; "Other" covers the rest).
const PLAYERS = {
  Mexico: ["Raúl Jiménez", "Santiago Giménez"],
  "South Korea": ["Son Heung-min", "Hwang Hee-chan"],
  "South Africa": ["Percy Tau", "Lyle Foster"],
  Czechia: ["Patrik Schick", "Adam Hložek"],
  Canada: ["Jonathan David", "Cyle Larin", "Alphonso Davies"],
  Switzerland: ["Breel Embolo", "Zeki Amdouni"],
  Qatar: ["Almoez Ali", "Akram Afif"],
  "Bosnia & Herzegovina": ["Edin Džeko", "Ermedin Demirović"],
  Brazil: ["Vinícius Júnior", "Rodrygo", "Raphinha", "Endrick"],
  Morocco: ["Youssef En-Nesyri", "Brahim Díaz", "Hakim Ziyech"],
  Scotland: ["Che Adams", "Lyndon Dykes"],
  Haiti: ["Frantzdy Pierrot", "Duckens Nazon"],
  "United States": ["Christian Pulisic", "Folarin Balogun", "Ricardo Pepi"],
  Paraguay: ["Antonio Sanabria", "Julio Enciso"],
  Australia: ["Mathew Leckie", "Kusini Yengi"],
  Türkiye: ["Kerem Aktürkoğlu", "Arda Güler", "Hakan Çalhanoğlu"],
  Germany: ["Kai Havertz", "Florian Wirtz", "Jamal Musiala", "Niclas Füllkrug"],
  Ecuador: ["Enner Valencia", "Kevin Rodríguez"],
  "Ivory Coast": ["Sébastien Haller", "Wilfried Zaha"],
  Curaçao: ["Tahith Chong"],
  Netherlands: ["Memphis Depay", "Cody Gakpo", "Donyell Malen"],
  Japan: ["Kaoru Mitoma", "Takefusa Kubo", "Ayase Ueda"],
  Tunisia: ["Youssef Msakni", "Naïm Sliti"],
  Sweden: ["Alexander Isak", "Viktor Gyökeres", "Dejan Kulusevski"],
  Belgium: ["Romelu Lukaku", "Kevin De Bruyne", "Jérémy Doku"],
  Iran: ["Mehdi Taremi", "Sardar Azmoun"],
  Egypt: ["Mohamed Salah", "Omar Marmoush"],
  "New Zealand": ["Chris Wood"],
  Spain: ["Álvaro Morata", "Lamine Yamal", "Nico Williams", "Mikel Oyarzabal"],
  Uruguay: ["Darwin Núñez", "Federico Valverde", "Facundo Pellistri"],
  "Saudi Arabia": ["Salem Al-Dawsari", "Firas Al-Buraikan"],
  "Cape Verde": ["Ryan Mendes", "Garry Rodrigues"],
  France: ["Kylian Mbappé", "Ousmane Dembélé", "Marcus Thuram", "Randal Kolo Muani"],
  Senegal: ["Sadio Mané", "Nicolas Jackson", "Boulaye Dia"],
  Norway: ["Erling Haaland", "Alexander Sørloth"],
  Iraq: ["Aymen Hussein"],
  Argentina: ["Lionel Messi", "Lautaro Martínez", "Julián Álvarez"],
  Austria: ["Marko Arnautović", "Michael Gregoritsch"],
  Algeria: ["Riyad Mahrez", "Islam Slimani"],
  Jordan: ["Mousa Al-Tamari", "Yazan Al-Naimat"],
  Portugal: ["Cristiano Ronaldo", "Rafael Leão", "Gonçalo Ramos", "Bruno Fernandes"],
  Colombia: ["Luis Díaz", "Jhon Durán", "Rafael Santos Borré"],
  Uzbekistan: ["Eldor Shomurodov"],
  "DR Congo": ["Yoane Wissa", "Cédric Bakambu"],
  England: ["Harry Kane", "Bukayo Saka", "Phil Foden", "Jude Bellingham"],
  Croatia: ["Andrej Kramarić", "Bruno Petković"],
  Panama: ["José Fajardo", "Ismael Díaz"],
  Ghana: ["Iñaki Williams", "Mohammed Kudus", "Jordan Ayew"],
};

async function main() {
  // Teams
  for (const [groupName, teams] of Object.entries(GROUPS)) {
    for (const [name, code] of teams) {
      await prisma.team.upsert({
        where: { name },
        update: { code, groupName },
        create: { name, code, groupName },
      });
    }
  }
  console.log("✓ 48 teams seeded across 12 groups");

  // Curated scorer candidates
  let playerCount = 0;
  for (const [teamName, names] of Object.entries(PLAYERS)) {
    const team = await prisma.team.findUnique({ where: { name: teamName } });
    if (!team) continue;
    for (const name of names) {
      await prisma.player.upsert({
        where: { name_teamId: { name, teamId: team.id } },
        update: {},
        create: { name, teamId: team.id },
      });
      playerCount++;
    }
  }
  console.log(`✓ ${playerCount} scorer candidates seeded`);

  // Group fixtures: round-robin, slot 1..72 in matchday order (MD1 all groups, MD2, MD3)
  const groupNames = Object.keys(GROUPS);
  const teamsByGroup = {};
  for (const g of groupNames) {
    teamsByGroup[g] = await prisma.team.findMany({
      where: { groupName: g },
      orderBy: { id: "asc" },
    });
  }
  let slot = 0;
  for (const md of RR) {
    for (const g of groupNames) {
      const t = teamsByGroup[g];
      for (const [h, a] of md) {
        slot++;
        await prisma.match.upsert({
          where: { round_slot: { round: "GROUP", slot } },
          update: { groupName: g, homeTeamId: t[h].id, awayTeamId: t[a].id },
          create: {
            round: "GROUP",
            slot,
            groupName: g,
            homeTeamId: t[h].id,
            awayTeamId: t[a].id,
          },
        });
      }
    }
  }
  console.log(`✓ ${slot} group fixtures generated (slot 1..${slot})`);

  // Phases
  for (const p of PHASES) {
    await prisma.phase.upsert({
      where: { key: p.key },
      update: { label: p.label, sort: p.sort },
      create: p,
    });
  }
  console.log("✓ phases seeded (Group stage open)");

  // Knockout match skeleton (teams filled in later by the admin)
  for (const [round, count] of Object.entries(KO_MATCHES)) {
    for (let slot = 1; slot <= count; slot++) {
      await prisma.match.upsert({
        where: { round_slot: { round, slot } },
        update: {},
        create: { round, slot },
      });
    }
  }
  console.log("✓ knockout bracket skeleton created (32 fixtures)");

  // Tournament singleton
  await prisma.tournament.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // Admin account
  const pinHash = await bcrypt.hash("1234", 10);
  await prisma.user.upsert({
    where: { name: "admin" },
    update: { isAdmin: true },
    create: { name: "admin", pinHash, isAdmin: true, paid: true },
  });
  console.log("✓ admin user ready  (name: admin  /  PIN: 1234)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
