var selDiv = "";
var storedFiles = [];

$(document).ready(function() {
    $("#files").on("change", handleFileSelect);
    
    selDiv = $("#container"); 
    //$("#myForm").on("submit", handleForm);
    
    $("body").on("click", ".selFile", removeFile);
});
    
function handleFileSelect(e) {
    var files = e.target.files;
    var filesArr = Array.prototype.slice.call(files);
    var captionNum = 0;
    filesArr.forEach(function(f) {          

        // if(!f.type.match("image.*")) {
        //     return;
        // }
        storedFiles.push(f);
        
        var reader = new FileReader();
        reader.onload = function (e) {
            var startDiv = "<div class='fileAttachment'>";
            var imgHtml = "<label for='media'></label><img src='/deleteIcon.png' class='selFile' title='Click to remove'/>" + f.name + "<br/>";
            var captionHtml = "<label for='caption'>Caption : </label><input type='text' id='caption' name= 'caption-" + captionNum + "'>";
            var endDiv = "</div>";
            selDiv.append(startDiv + imgHtml + captionHtml + endDiv);
            captionNum = captionNum+1;
        }
        reader.readAsDataURL(f); 
    });
    
}
    
function removeFile(e) {
    var file = $(this).data("file");
    for(var i=0;i<storedFiles.length;i++) {
        if(storedFiles[i].name === file) {
            storedFiles.splice(i,1);
            break;
        }
    }
    $(this).parent().remove();
}

function change(var1,var2) // no ';' here
{
    var elem = document.getElementById(var1);
    var hiddenElem = document.getElementById(var2);
    if (elem.value=="keep") {
        hiddenElem.value = "delete";
        elem.value = "delete";
        elem.style.backgroundColor = "#990000";
    }   
    else {
        hiddenElem.value = "keep";
        elem.value = "keep";
        elem.style.backgroundColor = "buttonface";
    }
}

function editCommentButtonFunction(commentId){
    var editForm = "#editCommentForm" + commentId;
    $( editForm ).toggle( 'slow' );
}

// nav bar active on click
$(document).ready(function () {
        var url = window.location;
    // Will only work if string in href matches with location
        $('ul.nav a[href="' + url + '"]').parent().addClass('active');

    // Will also work for relative and absolute hrefs
        $('ul.nav a').filter(function () {
            return this.href == url;
        }).parent().addClass('active').parent().parent().addClass('active');
    });


$(document).ready(function() 
    { 
        $("#myTable").tablesorter( {sortList: [[0,0], [1,0]]} ); 
    } 
); 