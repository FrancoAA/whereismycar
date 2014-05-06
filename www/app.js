
var App = angular.module('whereismycar', [
    'ionic',
    'ngStorage'
]);

App.factory('Geolocation', ['$rootScope', '$q', '$interval', function($rootScope, $q, $interval) {
    var watchId = null;
    
    var options = {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 0
    };
    
    var toRad = function(deg) {
      return deg * (Math.PI/180);
    };
    
    function _distance(pos1, pos2) {
        var R = 6371; // Radius of the earth in km
        var dLat = toRad(pos1.coords.latitude - pos2.coords.latitude);  // deg2rad below
        var dLon = toRad(pos2.coords.longitude - pos1.coords.longitude); 
        var a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(pos1.coords.latitude)) * Math.cos(toRad(pos2.coords.latitude)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2); 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        var d = R * c; // Distance in km
        return d;
    }

    function _getCurrentPosition() {
        var d = $q.defer();
        
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                d.resolve(pos);
            }, 
            function (err) {
                d.reject(err);
            },
            options
        );
        
        return d.promise;
    }
    
    // NOTE: after some blocking issues between getCurrentPosition and watchPosition, 
    // I decided to emulate watchPosition with a $interval and getCurrentPosition
    function _alternativeWatchPosition() {
        watchId = $interval(function() {
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    $rootScope.$broadcast('positionChanged', pos);
                }, 
                function (err) {

                },
                options
            );
        }, 15000);
    }
   
    function _clearWatch() {
        $interval.cancel(watchId);
        watchId = undefined;
    }
    
    return {
        getCurrentPosition: _getCurrentPosition,
        watchPosition: _alternativeWatchPosition,
        clearWatch: _clearWatch,
        distance: _distance
    };
}]);


App.controller('ApplicationCtrl', [
    'Geolocation', 
    '$localStorage', 
    '$ionicLoading', 
    '$ionicPopup',
    '$timeout',
    '$scope', 
    function(Geolocation, $localStorage, $ionicLoading, $ionicPopup, $timeout, $scope) {
        // leaflet variables
        var map = L.map('map');
        var userIcon = L.icon({iconUrl: 'images/male-2.png', iconSize: [32, 37]});
        var carIcon = L.icon({iconUrl: 'images/car.png', iconSize: [32, 37]});
        var userMarker = L.marker().setIcon(userIcon);
        var carMarker = L.marker().setIcon(carIcon);

        $scope.carPosition = null;
        $scope.inProgress = false;
        $scope.saved = false;
        $scope.distanceToCar = 0.0;
        
        function initialize() {
            
            $ionicLoading.show({
                content: 'Initializing...',
                showBackdrop: true
            });
            
            // set the tile layer
            L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
                maxZoom: 18
            }).addTo(map);

            if ($localStorage.carPosition) {
                var pos = $localStorage.carPosition;
                var latlng = [pos.coords.latitude, pos.coords.longitude];
                $scope.saved = true;
                map.setView(latlng, 16);
                // display car marker on the map
                carMarker.setLatLng(latlng).addTo(map);
                $ionicLoading.hide();
                return;
            }
            
            Geolocation.getCurrentPosition().then(
                function(pos) {
                    // center the map on the current coordinates
                    var latlng = [pos.coords.latitude, pos.coords.longitude];
                    map.setView(latlng, 16);
                    // display car marker on the map
                    carMarker.setLatLng(latlng).addTo(map);
                    
                    $scope.carPosition = pos;
                    $ionicLoading.hide();
                }, 
                function(error) {
                    alert('Unable to get location: ' + error.message);
                    $ionicLoading.hide();
                }
            );
        }
        
        initialize();
        
        $scope.$on('positionChanged', function(event, pos) {
            $timeout(function(){    //use this instead of calling $apply or $digest
                // calculate the distance between the user and his car
                $scope.distanceToCar = Geolocation.distance(pos, $localStorage.carPosition);
                // if the distance is less than 10 meters
                if ($scope.distanceToCar <= 0.01) {
                    $ionicPopup.alert({title: 'Where is my car?', template: 'You have found your car!'});
                    $scope.reinitialize();
                } else {
                    var latlng = [pos.coords.latitude, pos.coords.longitude];
                    // update marker position
                    userMarker.setLatLng(latlng).update();
                    // recenter map around user position
                    map.setView(latlng);
                }
            });
        });
        
        $scope.savePosition = function() {
            if ($scope.carPosition) {
                $localStorage.carPosition = $scope.carPosition;
                $scope.saved = true;
            }
        };
        
        $scope.findCar = function() {
            
            $ionicLoading.show({
              content: 'Getting user location...',
              showBackdrop: true
            });
            
            Geolocation.getCurrentPosition().then(
                function(pos) {
                    $scope.inProgress = true;
                    // initialize user marker
                    userMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]).update().addTo(map);
                    $scope.$broadcast('positionChanged', pos);
                    // start tracking user position
                    Geolocation.watchPosition();
                    $ionicLoading.hide();
                }, 
                function(error) {
                    alert('Unable to get location: ' + error.message);
                    $scope.inProgress = false;
                    $ionicLoading.hide();
                }
            );
        };
        
        $scope.reinitialize = function() {
            Geolocation.clearWatch();
            $scope.carPosition = null;
            $scope.inProgress = false;
            $scope.saved = false;
            $scope.distanceToCar = 0.0;
            map.removeLayer(userMarker);
            delete $localStorage.carPosition;
        };
        
        $scope.updatePosition = function() {
            $ionicLoading.show({
              content: 'Getting current location...',
              showBackdrop: true
            });

            Geolocation.getCurrentPosition().then(
                function(pos) {
                    var latlng = [pos.coords.latitude, pos.coords.longitude];
                    carMarker.setLatLng(latlng).update().addTo(map);
                    map.setView(latlng);
                    $scope.carPosition = pos;
                    $ionicLoading.hide();
                }, 
                function(error) {
                    alert('Unable to get location: ' + error.message);
                    $ionicLoading.hide();
                }
            );
        };
    }
]);
