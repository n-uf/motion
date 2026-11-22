/** The recorder's own vitest config: the normal test run never reads it. */
import { recordConfig } from "../../../record/config";

export default recordConfig(new URL("..", import.meta.url).pathname);
