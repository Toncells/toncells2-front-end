import { useState, useEffect } from 'react';
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { beginCell, BitBuilder, Cell, TonClient, Dictionary, Address } from "ton";
import { sha256_sync } from 'ton-crypto'
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
const nft_coll_address = "EQAY-HSJsRfXpFASJfc2QgDYAOoUgc7NjIQSE-a603qe4efO"
const TONCENTER = "https://toncenter.com/api/v3"
const TONCENTER_API_KEY = "" // optional: put a free key from https://toncenter.com to raise 1 -> 10 rps
// slow-but-stable loading tuning (free tier is ~1 rps, bursts get 429)
const BATCH_SIZE = 10          // NFTs per accountStates request
const BATCH_DELAY = 1500       // pause between batches (ms)
const REQUEST_TIMEOUT = 20000  // per-request timeout (ms)
const MAX_RETRIES = 8          // retries per request before giving up
const ERROR_RETRY_DELAY = 30000 // full-load retry delay after a hard failure (ms)
const coverImg = "UklGRkYEAABXRUJQVlA4IDoEAAAQFQCdASpAAEAAPp1CmUq0My2rKhmcWLATiWkAE9B/b+ix8+P4PE19m/y/CDtWboRjnvItQLul6I/204waO71Wv6P9m/O59M/sT8A360f8fsQei02Cxol2bjbM2/x0d4+i27xcE/79VPMDoJLo0iCobsRjdsLhuiElwO/puar0C1135HBXzVcrh3vt18ffR0WTmkKHAn444fjTdvDzQQihhHLJJqRagsoEW+0O287h0AAA/vvQGycTEvTJP39yj9nu/wCTQBJF/ehnz7/mNXMU0DRwCJ3UtqvhqIzFj8B3n+CLx9xytEPmu4zrU5cQ3/5im2PX1dEwTQMrpDMPqvkPW/biBfDc+2eufkGmOCjkTJquXNPbk/MjkLxD0RieoWmbPEPjYH54fCrsdyBylr1qR2Mm0sH+azNkAmv4YzhitAplQg3PJ2ZuglT//8+y8vpxhsPwLKOtgkHkD5d/B4Y4dJvCwQyO9uIGTU7IgaV1NzeQZGme5+QD3puTL5f8PMIqV+1NGAKn9FteVF8s6iclgibOpzqCKGfUBr3DvplkCG3wmza7BoPWJrnuKLDfD+Eu3cQZ6jojHRFVH41eHx6G9EcigV/Pv7pGValQQmwJy/mGze7Cavg3hR+OP1BCvrsygNVkdaRYqJtCwhn6wn7oCUxjGzOuR65ZSiwCwcZ6fvjc7KAb/fMk9BcQNyBGwIw3vZkck70KLJeG2fg1egR+LISuUjzoHv9AwgTchYEKWJlfG0Lhv/jfz7dlwaa6BKA/6+Zs+p1pGU4IT8FkqC/zo6gENiOiYmnipvGkceyymKX1SF1jmcKXg+d0doCeN82lP1uuvYiAYXb5nXF1/PoyQ1BPbiRNlLFuZzxIozvVoeTrm+jDdOeBJBJF5tcYCtTAYHjFkAKBRnNWksErzdo63vsjcm+Zl7GRdv+MMvMD9PNLAio78JjGKxs4yOJcQ6ICCeuwB/lMy8k7jjyh+vUH6hfrLAkNxqfjw1I2Pxaxrjz3hktEDzVeGDE/ecVhE3iRqGPitYF5aC+c9+F/vGFYJlAjBV/i2IdLRJ6Ag5GQVEkzvDZyzv4WrD8nzL2PV12g/jh0KGJPgo3+gnR9tZRmLDYAhCCWWcNZ1U65QTTxcL1fFUa0bSEW6y1mxMfyG2ZdIEjPq3mD1MzOcvgdv4esM5/wwr/v53WyXeokaWnSu5zXsAdM5JRkun8/6KBp3BH/YvJdpRtJ70VoXz0O7PPL18sF5UiMzLzEso3+xE/RuNv9TfJyx0ntwO5RDRVBJwMA8AzOvDWLvcS0pHD+PApSr8uR/WJ5TNX7mFd0U6ZFis8opoPwlH0oWaZpYlX7tsja93R1Hvwlc7ArPCoHvfX8zW1RDYcPzhypSCwu7UaG0URtfCgXh71NLPPRSqarG8+nX47DOmqIQoyCr+D9t633LWb3+7nNb+gAAA=="

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// GET json with per-request timeout + retry/backoff. Retries on network errors,
// timeouts, 429 (rate limit) and 5xx, honoring the Retry-After header when present.
const fetchJson = async (url: string, onRetry?: (attempt: number, waitMs: number, reason: string) => void) => {
  const headers: Record<string, string> = TONCENTER_API_KEY ? { 'X-API-Key': TONCENTER_API_KEY } : {};
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    let reason = '';
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      // retryable server-side conditions
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        reason = `HTTP ${res.status}`;
        if (attempt >= MAX_RETRIES) throw new Error(reason);
        const wait = ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** attempt, 15000);
        onRetry?.(attempt + 1, wait, reason);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`); // non-retryable (4xx)
    } catch (e: any) {
      clearTimeout(timer);
      reason = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network error');
      // non-retryable HTTP errors already thrown above re-throw here on last check
      if (reason.startsWith('HTTP 4') || attempt >= MAX_RETRIES) throw new Error(reason);
      const wait = Math.min(1000 * 2 ** attempt, 15000);
      onRetry?.(attempt + 1, wait, reason);
      await sleep(wait);
    }
  }
};

// Fetch every NFT item of the collection (paginated) -> returns raw addresses "wc:HEX"
const fetchAllNftItems = async (onRetry?: any) => {
  const items: any[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const url = `${TONCENTER}/nft/items?collection_address=${nft_coll_address}&limit=${limit}&offset=${offset}`;
    const json = await fetchJson(url, onRetry);
    const batch = json.nft_items || [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    await sleep(BATCH_DELAY);
  }
  return items;
};

export function bufferToBigInt(buffer: any) {
  let hex = buffer.toString('hex');
  let bigInt = BigInt('0x' + hex);
  return bigInt;
}

export function flattenSnakeCell(cell: Cell) {
  let c: Cell | null = cell;
  let buff = new Buffer([]);
  while (c) {
    const cs = c.beginParse();
    if (cs.remainingBits === 0) {
      break;
    }
    const data = cs.loadBuffer(cs.remainingBits / 8);
    buff = Buffer.concat([buff, data]);
    c = c.refs && c.refs[0];
  }
  return buff.slice(1);
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
  const chunks: Buffer[] = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.slice(0, chunkSize));
    // eslint-disable-next-line no-param-reassign
    buff = buff.slice(chunkSize);
  }
  return chunks;
}

export function makeSnakeCell(data: Buffer): Cell {
  const chunks = bufferToChunks(data, 127);

  if (chunks.length === 0) {
    return beginCell().endCell();
  }

  if (chunks.length === 1) {
    return beginCell().storeBuffer(chunks[0]).endCell();
  }

  let curCell = beginCell();

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];

    curCell.storeBuffer(chunk);

    if (i - 1 >= 0) {
      const nextCell = beginCell();
      nextCell.storeRef(curCell);
      curCell = nextCell;
    }
  }

  return curCell.endCell();
}
export function encodeOffChainContent(content: any) {
  let data = Buffer.from(content);
  let offChainPrefix = Buffer.from([0x00]); // onchain
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}
export function encodeOnChainPic(img: any) {
  // const file = './img.png'
  // const img = fs.readFileSync(file);
  // console.log(img)
  let data = Buffer.from(img);
  let offChainPrefix = Buffer.from([0x00]); // onchain
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}

const Cells = () => {
  const [cells, setCells] = useState([] as any);
  const [selectedId, setSelectedId] = useState({} as any);
  const [editing, setEditing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [name, setName] = useState('');
  const [descrip, setDescrip] = useState('');
  const [img, setImg] = useState(null as any);
  const [img_old, setImgOld] = useState(null as any);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState({ ln: 0 } as any);

  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();

  useEffect(() => {
    if (!cells[0]) {
      let l = [] as any;
      for (let i = 0; i <= 1599; i++) {
        l.push({ id: i, content: {} })
      }
      setCells(l);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: any;
    let retryTimer: any;

    // Load the whole collection slowly and progressively: cells appear batch by
    // batch, every request retries on 429/timeout, and a hard failure schedules
    // a full retry so it heals itself without a manual reload.
    const load = async () => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      const onRetry = (attempt: number, waitMs: number, reason: string) =>
        setProgress(`rate-limited (${reason}), retrying in ${Math.round(waitMs / 1000)}s (try ${attempt})...`);
      try {
        setProgress('fetching nft list...');
        const items = await fetchAllNftItems(onRetry);
        const acc: any[] = [];
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          if (cancelled) return;
          const slice = items.slice(i, i + BATCH_SIZE);
          const qs = slice.map((it: any) => `address=${encodeURIComponent(it.address)}`).join('&');
          const json = await fetchJson(`${TONCENTER}/accountStates?${qs}&include_boc=true`, onRetry);
          const map: Record<string, string> = {};
          for (const a of json.accounts || []) if (a.data_boc) map[a.address.toUpperCase()] = a.data_boc;
          for (const it of slice) {
            const boc = map[it.address.toUpperCase()];
            if (!boc) continue;
            const [wc, hex] = it.address.split(':');
            acc.push({ nft_workchain: Number(wc), nft_address: hex.toUpperCase(), account_state_state_init_data: boc });
          }
          if (cancelled) return;
          setData({ ln: acc.length, account_states: [...acc] }); // progressive render
          setProgress(`loaded ${acc.length}/${items.length} nfts...`);
          setError('');
          if (i + BATCH_SIZE < items.length) await sleep(BATCH_DELAY);
        }
        setProgress('');
        setLoading(false);
        refreshTimer = setTimeout(load, 180000); // periodic refresh
      } catch (e: any) {
        if (cancelled) return;
        console.log(e);
        setLoading(false);
        setProgress('');
        setError(`Error with TON API: ${e.message} / retrying automatically in ${Math.round(ERROR_RETRY_DELAY / 1000)}s...`);
        retryTimer = setTimeout(load, ERROR_RETRY_DELAY); // self-heal
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      clearTimeout(retryTimer);
    };
  }, [])

  useEffect(() => {
    if (data.account_states) {
      console.log(data.ln)
      let i = 0
      const newCells = [...cells];
      const dt = [...data.account_states]
      let j = 0
      const ids = []
      while (i < data.ln) {
        const state = Cell.fromBase64(dt[i].account_state_state_init_data.toString('base64')).beginParse()
        const index = state.loadUint(64)
        const coll_add = state.loadMaybeAddress()
        const owner = state.loadMaybeAddress()
        if (owner) {
          const metadata = (state.loadRef().asSlice().skip(8).loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()))
          const editor = state.loadMaybeAddress()
          const byteCharacters = ((flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('image_data'))) || new Cell()).toString('base64')));
          ids.push(dt[i].nft_address)
          newCells[index] = {
            id: index, state: {
              nft_address: `${dt[i].nft_workchain}:${dt[i].nft_address}`,
              coll_add: coll_add?.toString(),
              owner: owner,
              editor: editor,
              image: byteCharacters,
              name: flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('name'))) || new Cell()).toString('utf-8'),
              description: flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('description'))) || new Cell()).toString('utf-8')
            }
          }
          j++
        }
        i++;
      }
      console.log(new Set(ids).size)
      const maped = new Set(newCells.map((e: any) => e.state ? e.state.nft_address : ''))
      console.log({ ln: newCells.filter((item: any, index: any) => item.state ? maped.has(item.state.nft_address) : false).length })
      setCells(newCells)
    }
  }, [data.ln]);

  useEffect(() => {
    setEditing(false)
    setName(selectedId.state ? selectedId.state.name : '')
    setDescrip(selectedId.state ? selectedId.state.description : '')
    setImg(selectedId.state ? selectedId.state.image : '')
    setImgOld(selectedId.state ? selectedId.state.image : '')
  }, [selectedId]);

  useEffect(() => {
    setName(selectedId.state ? selectedId.state.name : '')
    setDescrip(selectedId.state ? selectedId.state.description : '')
    setImg(img_old)
  }, [editing]);

  useEffect(() => {
    if (userFriendlyAddress) {
      (async () => {
        const endpoint = await getHttpEndpoint({ network: "mainnet" });
        const client = new TonClient({ endpoint });
        const res = await client.getBalance(Address.parseFriendly(userFriendlyAddress).address)
        setBalance(Number(res))
      })();
    }
    setSelectedId({})
  }, [userFriendlyAddress]);

  const submitTx = async () => {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    dict.set(bufferToBigInt(sha256_sync('description')), encodeOffChainContent(descrip));
    dict.set(bufferToBigInt(sha256_sync('name')), encodeOffChainContent(name));
    if (img_old !== img) dict.set(bufferToBigInt(sha256_sync('image_data')), encodeOnChainPic(img));
    const body =
      beginCell()
        .storeUint(0x1a0b9d51, 32)
        .storeUint(0, 64)
        .storeRef(
          beginCell()
            .storeInt(0x00, 8)
            .storeDict(dict)
            .endCell())
        .endCell()
    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 60 * 60, // 1h 
      messages: [
        {
          address: selectedId.state.nft_address,
          amount: "1000000000", // 1ton / rest (after nft fees) will be returned
          payload: body.toBoc().toString('base64')
        }]
    }
    try {
      tonConnectUI.sendTransaction(tx, {
        modals: 'all',
        skipRedirectToWallet: 'ios',
        notifications: [],
        returnStrategy: 'https://app.toncells.org/'
      })
    } catch (e) {
      console.log(e)
    }
  }

  const mintNft = async () => {
    console.log('minting', selectedId.id)
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    dict.set(bufferToBigInt(sha256_sync('description')), encodeOffChainContent('This is fully onchain editable NFT! More on https://t.me/toncells'));
    dict.set(bufferToBigInt(sha256_sync('name')), encodeOffChainContent('Cell # ' + selectedId.id));
    dict.set(bufferToBigInt(sha256_sync('image_data')), encodeOnChainPic(Buffer.from(coverImg, 'base64')));
    const body =
      beginCell()
        .storeUint(0x1, 32)
        .storeUint(0, 64)
        .storeUint(selectedId.id, 64)
        .storeRef(
          beginCell()
            .storeAddress(Address.parseFriendly(userFriendlyAddress).address)
            .storeRef(
              beginCell()
                .storeInt(0x00, 8)
                .storeDict(dict)
                .endCell())
            .storeAddress(Address.parseFriendly(userFriendlyAddress).address)
            .endCell())
        .endCell()
    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 60 * 60, // 1h 
      messages: [
        {
          address: nft_coll_address,
          amount: "2200000000",
          payload: body.toBoc().toString('base64')
        }]
    }
    try {
      tonConnectUI.sendTransaction(tx, {
        modals: 'all',
        skipRedirectToWallet: 'ios',
        notifications: [],
        returnStrategy: 'https://app.toncells.org/'
      })
    } catch (e) {
      console.log(e)
    }
  }

  return (
    <div className="logic">
      <br />
      toncells v2
      <br />
      THESE NFTs ARE SBTs 
      <br />
      meaning you cant sell or transfer them.
      <br />
      buy this nfts only if you want to try this technology & store your data onchain forever!
      <br />
      {loading ? <p>loading onchain data from TON API... {progress}</p> : ''}
      {error ? <p>!{error}</p> : ''}
      {userFriendlyAddress ? <p>balance: {(balance / 1000000000).toFixed(3)}ton</p> : ""}
      {selectedId.id || selectedId.id === 0 ? <p>{`selected nft id: ${selectedId.id}`}</p> : <p>no selected nft</p>}
      {selectedId.id || selectedId.id === 0 ? <p><button onClick={() => setSelectedId({})}>{`unselect X`}</button></p> : ''}
      {(selectedId.id || selectedId.id === 0) && !selectedId.state && userFriendlyAddress ? <p><button className='mint' onClick={() => mintNft()}>{`mint this nft!`}</button><i className='mint_text'>you will pay 2.2TONs / 2ton as tip to creator + ~0.2ton for fess </i></p> : ''}
      {selectedId.state ? <p><img src={`data: image/*;base64,${selectedId.state.image}`} /></p> : ''}
      {selectedId.state ? <p>nft address: <span className='addr' onClick={() => navigator.clipboard.writeText(Address.parse(selectedId.state.nft_address).toString())}>{Address.parse(selectedId.state.nft_address).toString().slice(0, 5)}...{Address.parse(selectedId.state.nft_address).toString().slice(-5)}</span> <i className='addr_text'>click to copy</i></p> : ''}
      {selectedId.state ? <p>name: {selectedId.state.name}</p> : ''}
      {selectedId.state ? <p>description: {selectedId.state.description}</p> : ''}
      {selectedId.state && !userFriendlyAddress ? <p>connect your wallet to edit nfts!!!!</p> : ''}
      {selectedId.state && userFriendlyAddress && !Address.parseFriendly(userFriendlyAddress).address.equals(selectedId.state.editor) ? <p>you are not an editor of this nft</p> : ''}
      {selectedId.state && userFriendlyAddress && Address.parseFriendly(userFriendlyAddress).address.equals(selectedId.state.editor) ? <p><button onClick={() => { setEditing(!editing) }}>{editing ? 'cancel update X' : 'edit this nft'}</button> </p> : ''}
      {editing ? <div>
        <input placeholder='name' onChange={(e: any) => setName(e.target.value)} value={name} />
        <br />
        <input placeholder='description' onChange={(e: any) => setDescrip(e.target.value)} value={descrip} />
        <br />
        {img === img_old ? <p>img wont change</p> : <p>u selected new img:</p>}
        <input type="file" accept="image/*"
          onChange={(e: any) => {
            const file = e.target.files[0];
            if (file) {
              if (file.size < 63 * 1024) { // 100 * 1024 bytes = 100KB
                const reader = new FileReader();
                reader.onload = (readEvent) => {
                  const buffer = readEvent?.target?.result;
                  setImg(buffer)
                };
                reader.readAsArrayBuffer(file);
              } else {
                alert("File size exceeds 63KB");
                e.target.value = "";
              }
            }
          }} />
        <br />
        <br />
        <button className='update' onClick={submitTx}>update nft!</button>
        <i className='update_text'>you will send 1ton / and get remaining TONs after fees BACK</i>
        <br />
        <br />
      </div> : ''}
      <div className="cells">
        {cells[0] ? cells.map((cell: any, i: any) => (
          <div className={`cell ${cell.id === selectedId.id ? 'selected' : ''} `} key={i} onClick={(e: any) => {
            setSelectedId(cell)
          }}>
            {cell.state ? <img src={`data:image/*;base64,${cell.state.image ? cell.state.image
              : coverImg}`} /> : ''}
          </div>
        )) : 'no cells :('}
        <br />
      </div>
      <br />
      toncells <a href={"https://toncells.org"}>landing page</a>
      <br />
      toncells v1 <a href={"https://old.toncells.org"}>old app</a>
      <br />
      telegram <a href={"https://toncells.t.me"}>channel</a>
      <br />
      opensorsed on <a href={"https://github.com/orgs/Toncells/repositories"}>github</a>
    </div >
  )
}

export default Cells;
