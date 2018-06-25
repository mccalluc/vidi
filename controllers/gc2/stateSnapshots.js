let fs = require('fs');
let crypto = require('crypto');
let express = require('express');
let router = express.Router();

/*
var config = require('../../config/config.js').gc2;
var request = require('request');
var utf8 = require('utf8');
*/

const storage = `./temporary-state-storage.json`;
const throwError = (response, errorCode) => {
    response.status(400);
    response.json({ error: errorCode });
};

const getSnapshots = () => {
    return new Promise((resolve, reject) => {
        fs.readFile(storage, (error, data) => {
            if (error) {
                console.log(error);
                reject(`UNABLE_TO_READ_FILE`);
            } else {
                let parsedData = JSON.parse(data.toString());
                resolve(parsedData);
            }
        });
    });
};

const saveSnapshots = (snapshots) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(storage, JSON.stringify(snapshots), (error) => {
            if (error) {
                console.log(error);
                reject(`UNABLE_TO_WRITE_FILE`);
            } else {                        
                resolve();
            }
        });
    });
};

const appendToSnapshots = (snapshot) => {
    return new Promise((resolve, reject) => {
        getSnapshots().then(data => {
            let hash = crypto.randomBytes(20).toString('hex');
            if (`id` in snapshot) {
                reject(`SNAPSHOT_ID_ALREADY_EXISTS`);
            } else {
                let currentDate = new Date();
                snapshot.id = hash;
                snapshot.created_at = currentDate.toISOString();
                data.push(snapshot);

                saveSnapshots(data).then(() => {
                    resolve(hash);
                }).catch(errorCode => {
                    reject(errorCode);
                });
            }
        }).catch(errorCode => {
            reject(errorCode);
        });
    });
};

router.get('/api/state-snapshots', (request, response, next) => {
    fs.stat(storage, (error, stats) => {
        if (error) fs.writeFileSync(storage, `[]`);
        getSnapshots().then(data => {
            response.json(data);
        }).catch(error => {
            console.log(error);
            throwError(response, 'UNABLE_TO_OPEN_DATABASE');
        });
    });
});

router.post('/api/state-snapshots', (request, response, next) => {
    // Check if snapshot data was provided
    if (`snapshot` in request.body) {
        // By this moment user has to be authorized, otherwise 403 will be returned
        appendToSnapshots(request.body).then(id => {
            response.json({ id, status: 'success' });
        }).catch(errorCode => {
            throwError(response, errorCode);
        });       
    } else {
        throwError(response, 'MISSING_DATA');
    }
});

router.delete('/api/state-snapshots/:id', (request, response, next) => {
    getSnapshots().then(data => {
        let snapshotIndex = -1;
        data.map((item, index) => {
            if (item.id === request.params.id) {
                snapshotIndex = index;
                return false;
            }
        });

        if (snapshotIndex < 0) {
            throwError(response, 'UNABLE_TO_FIND_SNAPSHOT');
        } else {
            data.splice(snapshotIndex, 1);
            saveSnapshots(data).then(() => {
                response.json({ status: 'success' });
            }).catch(errorCode => {
                throwError(response, errorCode);
            });
        }
    }).catch(error => {
        console.log(error);
        throwError(response, 'UNABLE_TO_OPEN_DATABASE');
    });
});

module.exports = router;
