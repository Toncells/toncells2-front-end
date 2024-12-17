import { useState, useEffect } from 'react';
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { beginCell, BitBuilder, Cell, TonClient, Dictionary, Address } from "ton";
import { sha256_sync } from 'ton-crypto'
import { useLazyQuery, gql } from '@apollo/client';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { loadavg } from 'os';
const nft_coll_address = "EQAY-HSJsRfXpFASJfc2QgDYAOoUgc7NjIQSE-a603qe4efO"
const coverImg = "UklGRkYEAABXRUJQVlA4IDoEAAAQFQCdASpAAEAAPp1CmUq0My2rKhmcWLATiWkAE9B/b+ix8+P4PE19m/y/CDtWboRjnvItQLul6I/204waO71Wv6P9m/O59M/sT8A360f8fsQei02Cxol2bjbM2/x0d4+i27xcE/79VPMDoJLo0iCobsRjdsLhuiElwO/puar0C1135HBXzVcrh3vt18ffR0WTmkKHAn444fjTdvDzQQihhHLJJqRagsoEW+0O287h0AAA/vvQGycTEvTJP39yj9nu/wCTQBJF/ehnz7/mNXMU0DRwCJ3UtqvhqIzFj8B3n+CLx9xytEPmu4zrU5cQ3/5im2PX1dEwTQMrpDMPqvkPW/biBfDc+2eufkGmOCjkTJquXNPbk/MjkLxD0RieoWmbPEPjYH54fCrsdyBylr1qR2Mm0sH+azNkAmv4YzhitAplQg3PJ2ZuglT//8+y8vpxhsPwLKOtgkHkD5d/B4Y4dJvCwQyO9uIGTU7IgaV1NzeQZGme5+QD3puTL5f8PMIqV+1NGAKn9FteVF8s6iclgibOpzqCKGfUBr3DvplkCG3wmza7BoPWJrnuKLDfD+Eu3cQZ6jojHRFVH41eHx6G9EcigV/Pv7pGValQQmwJy/mGze7Cavg3hR+OP1BCvrsygNVkdaRYqJtCwhn6wn7oCUxjGzOuR65ZSiwCwcZ6fvjc7KAb/fMk9BcQNyBGwIw3vZkck70KLJeG2fg1egR+LISuUjzoHv9AwgTchYEKWJlfG0Lhv/jfz7dlwaa6BKA/6+Zs+p1pGU4IT8FkqC/zo6gENiOiYmnipvGkceyymKX1SF1jmcKXg+d0doCeN82lP1uuvYiAYXb5nXF1/PoyQ1BPbiRNlLFuZzxIozvVoeTrm+jDdOeBJBJF5tcYCtTAYHjFkAKBRnNWksErzdo63vsjcm+Zl7GRdv+MMvMD9PNLAio78JjGKxs4yOJcQ6ICCeuwB/lMy8k7jjyh+vUH6hfrLAkNxqfjw1I2Pxaxrjz3hktEDzVeGDE/ecVhE3iRqGPitYF5aC+c9+F/vGFYJlAjBV/i2IdLRJ6Ag5GQVEkzvDZyzv4WrD8nzL2PV12g/jh0KGJPgo3+gnR9tZRmLDYAhCCWWcNZ1U65QTTxcL1fFUa0bSEW6y1mxMfyG2ZdIEjPq3mD1MzOcvgdv4esM5/wwr/v53WyXeokaWnSu5zXsAdM5JRkun8/6KBp3BH/YvJdpRtJ70VoXz0O7PPL18sF5UiMzLzEso3+xE/RuNv9TfJyx0ntwO5RDRVBJwMA8AzOvDWLvcS0pHD+PApSr8uR/WJ5TNX7mFd0U6ZFis8opoPwlH0oWaZpYlX7tsja93R1Hvwlc7ArPCoHvfX8zW1RDYcPzhypSCwu7UaG0URtfCgXh71NLPPRSqarG8+nX47DOmqIQoyCr+D9t633LWb3+7nNb+gAAA=="
const GET_STATES = gql`
  query GetAccountStates {
   account_states(
   parsed_nft_collection_address_address: "18F87489B117D7A4501225F7364200D800EA1481CECD8C841213E6BAD37A9EE1"
  ) {
    nft_workchain: workchain
  }
  }
`;

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
  const [error, setError] = useState('');
  const [data, setData] = useState({ ln: 0 } as any);

  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();
  const [getNfts, dton_responce_old] = useLazyQuery(GET_STATES);

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

    const fn = () => {
      let i = 0;
      let dataToSet = [] as any;
      (async () => {
        setLoading(true)
        while (i < 36) {
          const GET_STATES_a = gql`
  query GetAccountStates {
   raw_account_states(
    order_by: "lt"
   page_size: 50
   page: ${i}
   parsed_nft_collection_address_address: "18F87489B117D7A4501225F7364200D800EA1481CECD8C841213E6BAD37A9EE1"
  ) {
    nft_address: address
    nft_workchain: workchain
    account_state_state_init_data
  }
  }
`;
          const dton_responce = await getNfts({
            query: GET_STATES_a,
          })
          if (!dton_responce.error) {
            if (dton_responce.data.raw_account_states.length === 0) {
              i = 36
            }
            dataToSet.push(...dton_responce.data.raw_account_states)
            const maped = new Set(dataToSet.map((e: any) => e.nft_address))
            setData({ ln: dataToSet.filter((item: any, index: any) => maped.has(item.nft_address)).length, account_states: dataToSet.filter((item: any, index: any) => maped.has(item.nft_address)) })
          } else {
            setError(dton_responce.error.message)
          }
          i++
        }
        setLoading(false)
      })()

    }
    fn()
    setInterval(() => {
      fn()
    }, 60000);


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
        returnStrategy: 'https://2.toncells.org/'
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
        returnStrategy: 'https://2.toncells.org/'
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
      DONT BUY THIS NFT IF YOU WANT TO FLIP IT
      <br />
      buy this nfts only if you want to have fun and try this technology!
      <br />
      {loading ? <p>loading onchain data...</p> : ''}
      {error ? <p>Error : {error} / reload the page</p> : ''}
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
      <br/>
      toncells <a href={"https://toncells.org"}>landing page</a>
      <br/>
      toncells v1 <a href={"https://old.toncells.org"}>old app</a>
      <br/>
      telegram <a href={"https://toncells.t.me"}>channel</a>
      <br/>
      opensorsed on <a href={"https://github.com/orgs/Toncells/repositories"}>github</a>
    </div >
  )
}

export default Cells;
