export function createPinnedTableHeader(viewport,onResize=()=>{}) {
  let table=null;
  let frame=0;

  function pin() {
    const header=table?.tHead;
    if(!header||!viewport.clientHeight)return;
    // The original header stays in the table and scrolls horizontally with it.
    const {top,height}=table.getBoundingClientRect();
    const offset=Math.max(0,Math.min(-top,height-header.offsetHeight));
    header.style.transform=offset?`translateY(${offset}px)`:'';
  }

  function refresh() {
    onResize();
    pin();
  }
  const observer=new ResizeObserver(refresh);
  observer.observe(viewport);
  window.addEventListener('scroll',()=>{
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      pin();
    });
  },{passive:true});

  return nextTable=>{
    if(table!==nextTable){
      if(table)observer.unobserve(table);
      table=nextTable;
      if(table)observer.observe(table);
    }
    refresh();
  };
}
