import { useRoom } from './state/RoomProvider';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Match } from './screens/Match';
import { Admin } from './screens/Admin';
import { Toasts } from './ui/Toasts';

export function App() {
  const { room } = useRoom();
  if (location.pathname.startsWith('/admin')) return <Admin />;
  let screen;
  if (!room) screen = <Home />;
  else if (room.data.phase === 'lobby') screen = <Lobby room={room.data} />;
  else screen = <Match room={room.data} receivedAt={room.at} />;
  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}
