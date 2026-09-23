import { expose } from 'comlink';

import { createForecastWorkerApi } from './protocol';

// An authorized model is not connected at this preparation gate. The protocol
// responds explicitly instead of inventing numerical forecasts.
expose(createForecastWorkerApi());
