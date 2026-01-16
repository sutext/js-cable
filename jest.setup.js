// Jest setup file to add TextEncoder and TextDecoder to global scope
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
