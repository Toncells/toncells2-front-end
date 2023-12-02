import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';
import Cells from './Cells';

const App = () => {
  const userFriendlyAddress = useTonAddress();

  return (
    <div className="app">
      <div className="header">
        connect ur shitty wallet
        <TonConnectButton />
      </div>
      <div className="body">
        <Cells />
      </div>
    </div>
  );
}

export default App;
