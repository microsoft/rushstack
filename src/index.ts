import { ServeTask } from './ServeTask';
import { ReloadTask } from './ReloadTask';
import TrustCertTask from './TrustCertTask';
import UntrustCertTask from './UntrustCertTask';

export const serve: ServeTask = new ServeTask();
export const reload: ReloadTask = new ReloadTask();
export const trustDevCert: TrustCertTask = new TrustCertTask();
export const untrustDevCert: UntrustCertTask = new UntrustCertTask();

export default serve; // tslint:disable-line:export-name
