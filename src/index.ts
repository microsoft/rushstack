import { serial, IExecutable } from 'gulp-core-build';
import { MochaTask } from './MochaTask';
import { InstrumentTask } from './InstrumentTask';

export const instrument = new InstrumentTask();
export const mocha = new MochaTask();

export default serial(instrument, mocha) as IExecutable;
