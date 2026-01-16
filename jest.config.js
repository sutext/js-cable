module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/**/*.ts', '**/?(*.)+(spec|test).ts'],
    moduleFileExtensions: ['ts', 'js'],
    transform: {
        '^.+.ts$': 'ts-jest',
    },
    setupFiles: ['<rootDir>/jest.setup.js'],
};
