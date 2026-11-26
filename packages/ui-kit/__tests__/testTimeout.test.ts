/** The load-scaled Jest time limit every plugin and the packages suite read (#422). */
const {testTimeout} = require('../plugin-config');

test("an idle machine keeps Jest's 5-second default", () => {
  expect(testTimeout({load: 0, cpus: 8, jobs: 0})).toBe(5000);
});

test('a loaded machine gives each test more time', () => {
  expect(testTimeout({load: 24, cpus: 8, jobs: 0})).toBe(15000);
});

test('inside a landing gate each test gets the cap, whatever the load when Jest starts', () => {
  // A gate read load 17 on 8 CPUs, so 10.5 s, then the load rose to 38 beside other gates (#451).
  expect(testTimeout({load: 17, cpus: 8, jobs: 8})).toBe(60000);
  expect(testTimeout({load: 0, cpus: 4, jobs: 1})).toBe(60000);
});

test('the time limit never passes the 60-second cap', () => {
  expect(testTimeout({load: 350, cpus: 8, jobs: 0})).toBe(60000);
});

test('no CPU count is read as one CPU, never as a division by zero', () => {
  expect(testTimeout({load: 2, cpus: 0, jobs: 0})).toBe(10000);
});
