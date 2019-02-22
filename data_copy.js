const connObj = require('./data_copy_db');
const readline = require('readline');

/* ====================================================
  전역 변수의 정의
=====================================================  */
let converionItem = process.argv[2]; // 실행할때 첫번째 Param Config의 데이터 정의명(테이블명)
if (converionItem == null || converionItem == '') {
    process.exit(-1);
}

// Target 테이블에 데이터가 존재할때 삭제 여부 확인할때 사용
let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let sConn = connObj.sourceConn(); // source connection
let tConn = connObj.targetConn(); // target connection 
let dbConfig = connObj.config[converionItem]; // tables Info

let chunkNo = 0; // 데이터는 Chunk로 나누어서 Select(Limit사용) Insert함 (Chunk Size는 config의 Fetch_size)


// Entry Point
checkTargetTable();


function closeApp(param) {
    sConn.end();
    tConn.end();
    process.exit(param);
}

// Target Table에 Data가 존재하는지 체크
function checkTargetTable() {
    let sql_check = makeCheckQuery();

    promiseCheckTargetTable(tConn, sql_check)
        .then(function(rowCount) {
            if (rowCount > 0) {
                console.log("There is target data");
                process.nextTick(askDeleteTargetData); // 데이터가 존재하면 삭제할것 인지 묻는다.
            } else {
                console.log("There is no target data");
                process.nextTick(selectDataChunk);
            }
        }, function(err) {
            console.log("Invalidate target Table ...");
            process.nextTick(closeApp, -1);
        });
}

// Target 테이블에 데이터를 삭제할 것인지 묻는다.
function askDeleteTargetData() {
    promiseConfirmDelete()
        .then(function(answer) {
            process.nextTick(deleteTargetTable);
        }, function(err) {
            console.log("start copy data");
            process.nextTick(selectDataChunk);
        });
}


// Target 테이블 삭제 호출
function deleteTargetTable() {
    let sql_delete = makeDeleteQuery();

    promiseDeleteTable(tConn, sql_delete)
        .then(function(result) {
            process.nextTick(selectDataChunk);
        }, function() {
            console.log("failed to delete target table!!!");
            closeApp(-1);
        })
}


// source 데이터를 target으로 fetch_size 만큼 이동
function selectDataChunk() {
    let sql_select = makeSelectQuery(chunkNo);
    promiseSelectTable(sConn, sql_select)
        .then(function(result) {
            let sql_insert = makeInsertQuery();
            let objToInsert = makeObjToInsert(result);

            return promiseInsertTargetTable(tConn, sql_insert, objToInsert);
        }, function(error) {
            console.log(error);
        })
        .then(function(result) {
            if (Number(dbConfig.fetch_size) == Number(result)) {
                ++chunkNo;
                process.nextTick(selectDataChunk);
            } else {
                process.nextTick(closeApp);
            }
        }, function(err) {

        });
}




// target table에 데이터 건수 조회
function promiseCheckTargetTable(conn, sql) {
    return new Promise(function(resolve, reject) {
        console.log(sql);
        conn.query(sql, function(err, result) {
            if (!err) {
                resolve(result[0].cnt);
            } else {
                reject(err);
            }
        });
    });
}

// target table에 데이터가 존재할때, 명령행에서 삭제할 것인지 input
function promiseConfirmDelete() {
    return new Promise((resolve, reject) => {
        rl.question('기존 데이터를 삭제하시겠습니까(y/N)? ', (answer) => {
            rl.close();
            if (answer.toUpperCase() == "Y") {
                resolve("Y");
            } else {
                reject("N");
            }
        });
    });
}

// target table 삭제
function promiseDeleteTable(conn, sql) {
    return new Promise(function(resolve, reject) {
        console.log(sql);
        conn.query(sql, function(err, result) {
            if (err) {
                reject(err);
            } else {
                conn.commit();
                console.log("Sueeccd to delete target table!!");
                resolve(result);
            }
        });
    });
}

// source table에서 데이터 조회
function promiseSelectTable(conn, sql) {
    return new Promise(function(resolve, reject) {
        console.log(sql);
        conn.query(sql, function(err, result) {
            if (err) {
                reject(err);
            } else {
                console.log("end of select ")
                resolve(result);
            }
        });
    });
}

// Target Table Data chunk Insert
function promiseInsertTargetTable(conn, sql, values) {
    return new Promise(function(resolve, reject) {
        console.log(sql);
        conn.query(sql, [values], function(err, result) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                conn.commit();
                console.log("Commit!!!");
                //console.log(JSON.stringify(result));
                resolve(result.affectedRows);
            }
        });
    });
}







// 쿼리 생성
function makeCheckQuery() {
    var sql = "SELECT COUNT(*) cnt FROM " + dbConfig.target.table + " ";
    return sql;
}

function makeDeleteQuery() {
    var sql = "DELETE FROM " + dbConfig.target.table + " ";
    return sql;
}

function makeSelectQuery(no) {
    var sql = dbConfig.source.query.join("\n") + " limit " + (no * dbConfig.fetch_size) + ", " + dbConfig.fetch_size;

    return sql;
}


function makeInsertQuery() {
    var sql = "INSERT INTO " + dbConfig.target.table + " (" + dbConfig.target.fields[0];

    for (var i = 1; i < dbConfig.target.fields.length; i++) {
        sql += "," + dbConfig.target.fields[i];
    }

    sql += " ) VALUES ?";
    return sql;
}

function makeObjToInsert(result) {
    let arrFields = dbConfig.target.fields;
    let arrObj = [];

    while (result.length > 0) {
        let srcRecord = result.shift();
        let arrRecord = [];

        for (var i = 0; i < arrFields.length; i++) {
            arrRecord.push(srcRecord[arrFields[i]]);
        }
        arrObj.push(arrRecord);
    }
    return arrObj;
}