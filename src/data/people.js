// src/data/people.js
//
// Names and jobs for the little people in the tower. Each tenant's name and
// job are worked out from their id (so they never change and do not need to
// be saved).

const FIRST = [
  'Ada', 'Ben', 'Chloe', 'Dev', 'Elena', 'Felix', 'Grace', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Leo', 'Maya', 'Noah',
  'Olive', 'Pablo', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wren', 'Xavi', 'Yara', 'Zane', 'Amir',
  'Bella', 'Carlos', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivan', 'June', 'Kofi', 'Lena', 'Marco', 'Nina',
];
const LAST = [
  'Alvarez', 'Bennett', 'Chen', 'Dubois', 'Evans', 'Fischer', 'Gupta', 'Haddad', 'Ito', 'Jensen', 'Kowalski', 'Lopez',
  'Murphy', 'Nakamura', 'Okafor', 'Petrov', 'Quist', 'Rossi', 'Silva', 'Tanaka', 'Usman', 'Varga', 'Weber', 'Xu',
  'Yilmaz', 'Zhang', 'Adler', 'Brooks', 'Castillo', 'Dahl', 'Ellis', 'Foster', 'Garcia', 'Hughes', 'Ibrahim', 'Jones',
  'Khan', 'Lindqvist', 'Moreau', 'Novak',
];
const JOBS = {
  worker: [
    'Accountant', 'Software engineer', 'Graphic designer', 'Sales rep', 'Lawyer', 'Architect', 'HR manager',
    'Data analyst', 'Copywriter', 'Consultant', 'Paralegal', 'Marketing lead', 'Product manager', 'Illustrator',
  ],
  resident: [
    'Nurse', 'Teacher', 'Barista', 'Student', 'Retired chef', 'Musician', 'Bakery owner', 'Freelance writer',
    'Electrician', 'Librarian', 'Pilot', 'Photographer', 'Dog walker', 'Night-shift baker',
  ],
  guest: [
    'Visiting from Lisbon', 'Here for a conference', 'On honeymoon', 'Touring the city', 'On a business trip',
    'Visiting family', 'Attending a wedding', 'Between flights',
  ],
};

// A small, repeatable scramble of an id into a big number.
function mix(id, salt) {
  let h = (id * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

export function nameOf(tenant) {
  if (tenant.kind === 'inspector') return tenant.inspector?.purpose === 'vip' ? 'A VIP guest' : 'The inspector';
  return `${FIRST[mix(tenant.id, 1) % FIRST.length]} ${LAST[mix(tenant.id, 2) % LAST.length]}`;
}

export function jobOf(tenant) {
  if (tenant.kind === 'inspector') return tenant.inspector?.purpose === 'vip' ? 'Important visitor' : 'Tower inspector';
  const list = JOBS[tenant.kind] ?? JOBS.worker;
  return list[mix(tenant.id, 3) % list.length];
}
