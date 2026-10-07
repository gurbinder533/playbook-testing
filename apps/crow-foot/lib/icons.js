// Small inline icon set. Every icon takes a class and returns SVG markup.
const stroke = (cls, body, extra = "") =>
  `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const chevronDown = (c) => stroke(c, '<path d="M6 9l6 6 6-6"/>');
export const gear = (c) => stroke(c, '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>');
export const search = (c) => stroke(c, '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>');
export const refresh = (c) => stroke(c, '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>');
export const alert = (c) => stroke(c, '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>');
export const checkCircle = (c) => stroke(c, '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>');
export const xCircle = (c) => stroke(c, '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>');
export const clock = (c) => stroke(c, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
export const dashCircle = (c) => stroke(c, '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>');
export const comment = (c) => stroke(c, '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>');
export const lock = (c) => stroke(c, '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
export const pullRequest = (c) => stroke(c, '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-3m0 0l2-2m-2 2l2 2"/>');
export const merge = (c) => stroke(c, '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="14" r="2"/><path d="M6 8v8M8 6c6 0 10 2 10 6"/>');
export const draft = (c) => stroke(c, '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 6v2M18 11v2"/>');
export const stack = (c, style = "") => stroke(c, '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>', `style="${style}"`);
export const plus = (c) => stroke(c, '<path d="M12 5v14M5 12h14"/>');
export const trash = (c) => stroke(c, '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
export const arrowUp = (c) => stroke(c, '<path d="M12 19V5M6 11l6-6 6 6"/>');
export const filter = (c) => stroke(c, '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>');
export const feather = (c) => stroke(c, '<path d="M20 4a8 8 0 0 0-11 0L5 8v9l-2 4 4-2h9l4-4a8 8 0 0 0 0-11zM9 15l8-8"/>');

/** A crow's foot track in the section's color: three toes forward, one back. */
export const crowFoot = (c, style = "") =>
  `<svg class="ic ${c || ""}" viewBox="0 0 32 32" fill="currentColor" style="${style}"><path d="M14 18.2Q14.55 13.2 14.78 11.08Q15 8.95 15.7 6.78Q16.4 4.6 16.4 4.6Q16.4 4.6 16.7 6.82Q17 9.05 17.22 11.12Q17.45 13.2 17.73 15.7L18 18.2Z"/><path d="M14.98 19.92Q10.85 16.84 9.03 15.42Q7.21 14.01 5.56 12Q3.9 10 3.9 10Q3.9 10 6.14 11.2Q8.39 12.39 10.37 13.38Q12.35 14.36 14.69 15.42L17.02 16.48Z"/><path d="M14.98 16.48Q19.65 14.36 21.63 13.38Q23.61 12.39 25.86 11.2Q28.1 10 28.1 10Q28.1 10 26.44 12Q24.79 14.01 22.97 15.42Q21.15 16.84 19.09 18.38L17.02 19.92Z"/><path d="M17.85 18.16Q17.4 22.87 16.96 24.56Q16.51 26.26 15.36 27.83Q14.2 29.4 14.2 29.4Q14.2 29.4 14.44 27.57Q14.69 25.74 14.74 24.24Q14.8 22.73 14.48 20.49L14.15 18.24Z"/><circle cx="16" cy="18.2" r="2.2"/></svg>`;

export const logo = (c) =>
  `<svg class="ic ${c || ""}" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="cfsheen" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#7c4dff"/><stop offset="50%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#2dd4bf"/></linearGradient></defs><g fill="url(#cfsheen)"><path d="M14 18.2Q14.55 13.2 14.78 11.08Q15 8.95 15.7 6.78Q16.4 4.6 16.4 4.6Q16.4 4.6 16.7 6.82Q17 9.05 17.22 11.12Q17.45 13.2 17.73 15.7L18 18.2Z"/><path d="M14.98 19.92Q10.85 16.84 9.03 15.42Q7.21 14.01 5.56 12Q3.9 10 3.9 10Q3.9 10 6.14 11.2Q8.39 12.39 10.37 13.38Q12.35 14.36 14.69 15.42L17.02 16.48Z"/><path d="M14.98 16.48Q19.65 14.36 21.63 13.38Q23.61 12.39 25.86 11.2Q28.1 10 28.1 10Q28.1 10 26.44 12Q24.79 14.01 22.97 15.42Q21.15 16.84 19.09 18.38L17.02 19.92Z"/><path d="M17.85 18.16Q17.4 22.87 16.96 24.56Q16.51 26.26 15.36 27.83Q14.2 29.4 14.2 29.4Q14.2 29.4 14.44 27.57Q14.69 25.74 14.74 24.24Q14.8 22.73 14.48 20.49L14.15 18.24Z"/><circle cx="16" cy="18.2" r="2.2"/></g></svg>`;
