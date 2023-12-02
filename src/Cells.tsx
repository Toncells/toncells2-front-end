import { useState, useEffect } from 'react';
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { BitReader, BitBuilder, Cell, TonClient, Dictionary, Address } from "ton";
import { sha256_sync } from 'ton-crypto'

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

const Cells = () => {
  const [cells, setCells] = useState([] as any);
  const [selectedId, setSelectedId] = useState({} as any);

  useEffect(() => {
    let l = [] as any;
    for (let i = 1; i <= 1600; i++) {
      l.push({ id: i, content: {} })
    }
    setCells(l);
  }, []);

  useEffect(() => {
    if (cells[0] && !cells[0].state) {
      (async () => {
        let i = 0
        while (i < 1) {
          const endpoint = await getHttpEndpoint({ network: "testnet" });
          const client = new TonClient({ endpoint });
          const res = await client.getContractState(Address.parseFriendly("EQCPVQqjBdE-_Ngi_6NWLEkft9Y0R_zGkSavuekY0Mev1Xmh").address)
          if (res.data) {
            const state = Cell.fromBase64(res.data.toString('base64')).beginParse()
            console.log(state.loadUint(64)) //index
            console.log(state.loadMaybeAddress()) //collection_address
            console.log(state.loadMaybeAddress()) //owner_address
            const metadata = (state.loadRef().asSlice().skip(8).loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()))
            const byteCharacters = ((flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('image_data'))) || new Cell()).toString('base64')));
            const newCells = [...cells]; // Create a shallow copy of cells
            newCells[i] = {
              id: cells[i].id, state: {
                image: byteCharacters,
                name: flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('name'))) || new Cell()).toString('utf-8'),
                description: flattenSnakeCell(metadata.get(bufferToBigInt(sha256_sync('description'))) || new Cell()).toString('utf-8')
              }
            }
            setCells(newCells)
          }
          i++;
        }
      })()
    }
  }, [cells]);

  return (
    <div className="logic">
      {selectedId.id ? `selected id: ${selectedId.id}` : 'no selected id'}
      <br />
      {selectedId.state ? <img src={`data:image/*;base64,${selectedId.state.image}`} /> : ''}
      <br />
      {selectedId.state ? selectedId.state.name : ''}
      <br />
      {selectedId.state ? selectedId.state.description : ''}
      <br />
      <div className="cells">
        {cells[0] ? cells.map((cell: any, i: any) => (
          <div className="cell" key={i} onClick={(e: any) => {
            setSelectedId(cell)
          }}>
            {cell.state ? <img src={`data:image/*;base64,${cell.state.image}`} /> : ''}
          </div>
        )) : 'no cells'}
      </div>
    </div >
  )
}

export default Cells;
