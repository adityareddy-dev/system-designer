// Public reading links and answers also shown on the home page after startup.
export const homeFaqs = [
  ['What is System Designer?', 'A free browser game for learning system design. Build an architecture, run a simulated traffic day of spikes and outages, and see how it handles reliability, speed, data safety and cost.'],
  ['Who is it for?', 'Backend engineers, students and interview candidates who want to understand how systems behave. Beginners can start with the guided first system. Experienced engineers can try harder constraints.'],
  ['Is it free?', 'Yes. The lessons, practice problems and sandbox are free.'],
  ['Does it need an account?', 'On systemdesigner.io, a free Google or GitHub account is needed to play. Reading the problems, lessons and guides needs no account. The code is open source (MIT), so you can run your own copy with no account.'],
  ['Does it help with interviews?', 'It helps you practise clarification, estimates, architecture, failures and trade-offs. Interview mode on Medium and Hard problems adds a timed discussion and evidence-based defenses.'],
  ['How is it different from reading a book?', 'You make a prediction and watch your own design face traffic and failures. A debrief gives measurements for a retry. Playing lets you apply and test the ideas.']
];
export const interviewTopics = [
  ['system-design-interview-practice', 'System design interview practice'],
  ['system-design-interview-questions', 'System design interview questions'],
  ['design-a-url-shortener', 'Design a URL shortener'],
  ['design-a-rate-limiter', 'Design a rate limiter'],
  ['design-a-chat-system', 'Design a chat system'],
  ['design-a-notification-system', 'Design a notification system']
];
export const readingLinks = [
  ['problems/', 'Browse system design practice problems'],
  ['learn/', 'Read the system design lessons'],
  ['guides/', 'Follow system design walkthroughs'],
  ...interviewTopics.map(([id, title]) => [`interview/${id}/`, title])
];
