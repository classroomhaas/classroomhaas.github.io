function shot(what,ang,time,power,pow){
    this.time=0;
    this.x=0;
    this.y=0;
    this.power=power;
    this.ang=0;
    var hit=true;
    this.draw=()=>{
        if(this.time>0){
            circle(this.x,this.y,3,"red");
        }      
    }
    this.move=()=>{
        if(this.time>0){
            
            this.time--;
            this.xv = Math.cos(this.ang)*this.power;
            this.yv = Math.sin(this.ang)*this.power;
            this.x+=this.xv;
            this.y+=this.yv;
            
        }
    }
    this.shootFrom=()=>{
        this.x=what.x;
        this.y=what.y;
        this.ang=what.ang+ang;
        this.time=time;
    }
    this.dist=(what)=>{
        // return Math.sqrt(Math.pow(what.x-this.x,2)+Math.pow(what.y-this.y,2))<40
       var whatIndex= getIndex(what.x,what.y);
        var thisIndex = getIndex(this.x,this.y)
        return whatIndex===thisIndex;
    }
    this.checkCollision=(bruh)=>{
        if(this.dist(bruh)){
            let dist = Math.sqrt(Math.pow(what.x-this.x,2)+Math.pow(what.y-this.y,2));
            if(hit){
                console.log(what);
                if(what.facingLeft){
                    console.log(bruh.x);
                    if(pow<100){
                        bruh.x+=(pow/(dist*1.5))*100;
                    }else{
                        bruh.x+=pow;
                    }
                    
                    console.log(bruh.x);
                }else{
                    if(pow<100){
                        bruh.x-=(pow/(dist*2))*100;
                    }else{
                        bruh.x-=pow;
                    }
                }
                
                hit=false;
            }            
        }else{
            hit=true;
        }
    }
    this.shotDone=()=>{
        return this.time==1;
    }
    this.shotReady=()=>{
        return this.time<=0;
    }
}