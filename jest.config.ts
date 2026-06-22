import type {Config} from '@jest/types';
// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  testEnvironment: "jsdom",
  transform: {
  '^.+\\.tsx?$': 'ts-jest',
  // Transform ESM-only d3-format package (v3 is "type": "module")
  '^.+\\.js$': 'ts-jest',
  },
  moduleNameMapper: {
    "\\.(css|less|sass)$": "identity-obj-proxy"
  },
  // Allow Jest to transform ESM-only packages in node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!d3-format)",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/cypress/",
  ],
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",

};
export default config;
