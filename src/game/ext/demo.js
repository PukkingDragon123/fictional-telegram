// [v26 demo] game.demo: the demo build's gate (src/demo/DemoGate.js). In every other
// build DEMO is a constant false, so this installs nothing and the gate isn't bundled.
import { DEMO } from '../../demo/demo.js';
import { installDemo } from '../../demo/DemoGate.js';

export function install(game) { return DEMO ? installDemo(game) : null; }
