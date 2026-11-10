export function createPinnedTableHeader(viewport,onResize=()=>{},topControl=null) {
  let table=null;
  let frame=0;

  function pin() {
    const header=table?.tHead;
    if(!header||!viewport.clientHeight)return;
    // The original header stays in the table and scrolls horizontally with it.
    const {top,height}=table.getBoundingClientRect();
    const controlHeight=topControl?.offsetHeight??0;
    const offset=Math.max(0,Math.min(controlHeight-top,height-header.offsetHeight));
    const transform=offset?`translateY(${offset}px)`:'';
    header.style.transform=transform;
    if(topControl)topControl.style.transform=transform;
  }

  function refresh() {
    onResize();
    pin();
  }
  const observer=new ResizeObserver(refresh);
  observer.observe(viewport);
  if(topControl)observer.observe(topControl);
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
